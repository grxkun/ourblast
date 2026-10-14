// SPDX-License-Identifier: BUSL-1.1
/**
 * Launch a Sui token paid with SOL, ETH or BNB from the caller's OurBank deposit
 * addresses. Flow: review → user confirms → exact amount bridges to their OurBank
 * Sui wallet (no auto-buy) → once enough SUI arrives, the normal launch pipeline
 * runs. Nothing moves before confirmation; a failed launch leaves the SUI in the
 * user's own wallet.
 */
import { formatSui, launchFeeMist, requiredBalanceMist } from "./launchFee";
import { resolveLaunchpad } from "./launchpad";
import {
  estimateSuiOut, FUND_MIN, FUNDED_ARRIVAL_TIMEOUT_MS, FUNDED_REVIEW_TTL_MS,
  isCancelLaunch, isConfirmLaunch, parseFundWith, type FundWith,
} from "./fundedLaunch";
import type { DeployRequest } from "./xLauncher";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

interface Wallet { user_id: string | null; x_username: string; address: string; sol_address: string | null; evm_address: string | null }
const COLS = "user_id, x_username, address, sol_address, evm_address";

const ASSET_ID: Record<FundWith["asset"], string> = {
  SOL: "nep141:sol.omft.near",
  ETH: "nep141:base.omft.near",
  BNB: "nep245:v2_1.omni.hot.tg:56_11111111111111111111",
};

async function prices(): Promise<Record<string, number>> {
  const res = await fetch("https://1click.chaindefuser.com/v0/tokens", { signal: AbortSignal.timeout(10_000) });
  const list = (await res.json()) as { assetId: string; price: number }[];
  return Object.fromEntries(list.map((t) => [t.assetId, Number(t.price)]));
}

async function sourceBalance(w: Wallet, asset: FundWith["asset"]): Promise<number> {
  const { solBalances, evmBalances } = await import("./chain-balances.server");
  if (asset === "SOL") return w.sol_address ? (await solBalances(w.sol_address)).sol : 0;
  if (!w.evm_address) return 0;
  const all = await evmBalances(w.evm_address);
  const pick = all.filter((c) => (asset === "BNB" ? c.chain === "bsc" : c.chain === "base" || c.chain === "arbitrum"));
  return Math.max(0, ...pick.map((c) => c.eth));
}

async function suiBalance(address: string): Promise<bigint> {
  const { walletBalances } = await import("./crossChain.server");
  return (await walletBalances(address)).sui;
}

/** Builds the review and records a staged launch. Nothing moves. */
export async function stageFundedLaunch(opts: {
  postId: string;
  wallet: Wallet;
  handle: string;
  fund: FundWith;
  request: DeployRequest;
  iconUrl?: string | null;
  tweetText?: string | null;
}): Promise<{ ok: boolean; message: string; id?: string }> {
  const { wallet: w, fund, request } = opts;
  if (!w.user_id) return { ok: false, message: "Sign in at https://ourblast.xyz/terminal once to activate funded launches." };
  const pad = resolveLaunchpad(request.launchpad);
  if (!pad.integrated) return { ok: false, message: `${pad.label} launches aren't connected yet.` };
  if (fund.amount < FUND_MIN[fund.asset]) return { ok: false, message: `Minimum is ${FUND_MIN[fund.asset]} ${fund.asset}.` };
  if (fund.asset === "SOL" && !w.sol_address) return { ok: false, message: "You don't have an OurBank Solana address yet. Open the OurBank card first." };
  if (fund.asset !== "SOL" && !w.evm_address) return { ok: false, message: "You don't have an OurBank EVM address yet. Open the OurBank card first." };

  const db = await admin();
  // An open auto-buy order would swap the arriving SUI into $BLAST — never mix the two.
  const { data: open } = await db.from("cross_chain_orders").select("id").eq("user_id", w.user_id).in("status", ["pending", "swapping"]).limit(1);
  if (open?.length) return { ok: false, message: "An earlier bridge is still turning into $BLAST. Try again once it finishes (\"bridge status\")." };
  const { data: busy } = await db.from("funded_launches").select("id").eq("user_id", w.user_id).in("status", ["bridging", "launching"]).limit(1);
  if (busy?.length) return { ok: false, message: "Another funded launch is still in progress. Wait for it to finish." };

  const have = await sourceBalance(w, fund.asset);
  const fee = fund.asset === "SOL" ? 0.000005 : fund.asset === "BNB" ? 0.0005 : 0.0003;
  if (fund.amount + fee > have) return { ok: false, message: `Not enough ${fund.asset}: balance ${have.toFixed(5)} ${fund.asset} (keep ${fee} for network fees).` };

  const p = await prices().catch(() => ({} as Record<string, number>));
  const estSui = estimateSuiOut(fund.amount, p[ASSET_ID[fund.asset]] ?? 0, p["nep141:sui.omft.near"] ?? 0);
  if (!estSui) return { ok: false, message: "Couldn't price the bridge right now. Try again in a minute." };
  const current = await suiBalance(w.address);
  const need = requiredBalanceMist(pad.id);
  const after = current + BigInt(Math.floor(estSui * 1e9));
  if (after < need) {
    return { ok: false, message: `≈${estSui.toFixed(2)} SUI would arrive, but a ${pad.label} launch needs ${formatSui(need)} SUI in your wallet (you have ${formatSui(current)}). Send a bigger amount.` };
  }

  const { createLaunchRequest } = await import("./xLauncher.server");
  const row = await createLaunchRequest(opts.postId, opts.handle, request, opts.iconUrl ?? null, opts.tweetText ?? null);
  await db.from("x_launch_requests").update({ notice: `Waiting for ${fund.amount} ${fund.asset} to bridge to Sui.` }).eq("id", row.id).eq("status", "PENDING");
  const { data, error } = await db.from("funded_launches").insert({
    user_id: w.user_id, x_username: opts.handle.toLowerCase(), x_post_id: opts.postId, launch_request_id: row.id,
    symbol: request.symbol, launchpad: pad.id, asset: fund.asset, amount: fund.amount, sui_address: w.address,
    expires_at: new Date(Date.now() + FUNDED_REVIEW_TTL_MS).toISOString(),
  }).select("id").single();
  if (error?.code === "23505") return { ok: false, message: "" };
  if (error) throw new Error(error.message);
  const dest = `${w.address.slice(0, 6)}…${w.address.slice(-4)}`;
  return {
    ok: true,
    id: data.id,
    message: `Review: bridge ${fund.amount} ${fund.asset} (≈${estSui.toFixed(2)} SUI) → Sui wallet ${dest}, then launch $${request.symbol} on ${pad.label} (${formatSui(launchFeeMist(pad.id))} SUI fee + gas). Leftover SUI stays in your wallet.`,
  };
}

/** Confirms a staged launch and starts the bridge. Only one confirm can ever act on it. */
export async function confirmFundedLaunch(id: string, userId?: string): Promise<{ ok: boolean; message: string; link?: string | undefined }> {
  const db = await admin();
  let q = db.from("funded_launches").update({ status: "bridging", updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "staged").gt("expires_at", new Date().toISOString());
  if (userId) q = q.eq("user_id", userId);
  const { data: row } = await q.select("*").maybeSingle();
  if (!row) return { ok: false, message: "No launch waiting for confirmation (reviews expire after 10 min)." };
  let out: { ok: boolean; message: string; link?: string | undefined };
  try {
    if (row.asset === "SOL") {
      const { bridgeSolNowForUser } = await import("./sol-sweep.server");
      const r = await bridgeSolNowForUser(row.user_id, Number(row.amount), "keep");
      out = { ok: r.ok, message: r.message, link: r.txSig ? `https://solscan.io/tx/${r.txSig}` : undefined };
    } else {
      const { bridgeEvmAmountForUser } = await import("./evm-sweep.server");
      const r = await bridgeEvmAmountForUser(row.user_id, row.asset as "ETH" | "BNB", Number(row.amount));
      out = { ok: r.ok, message: r.message, link: r.explorer };
    }
  } catch (e) {
    out = { ok: false, message: e instanceof Error ? e.message : "Bridge failed." };
  }
  const now = new Date().toISOString();
  if (!out.ok) {
    await db.from("funded_launches").update({ status: "failed", notice: out.message.slice(0, 300), updated_at: now }).eq("id", id);
    await db.from("x_launch_requests").update({ status: "FAILED", notice: `Bridge failed: ${out.message}`.slice(0, 300) }).eq("id", row.launch_request_id).eq("status", "PENDING");
    return { ok: false, message: `Launch not started — ${out.message}` };
  }
  await db.from("funded_launches").update({ bridge_tx: out.link ?? null, bridged_at: now, updated_at: now }).eq("id", id);
  return { ok: true, link: out.link, message: `${out.message} $${row.symbol} launches on ${row.launchpad} as soon as the SUI lands (usually 1–20 min).` };
}

export async function cancelFundedLaunch(id: string, userId?: string): Promise<boolean> {
  const db = await admin();
  let q = db.from("funded_launches").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "staged");
  if (userId) q = q.eq("user_id", userId);
  const { data } = await q.select("launch_request_id").maybeSingle();
  if (data) await db.from("x_launch_requests").update({ status: "FAILED", notice: "Cancelled by the launcher." }).eq("id", data.launch_request_id).eq("status", "PENDING");
  return Boolean(data);
}

/**
 * X mentions: "launch $MOON on suipump with 0.1 sol" (stage + review) and the
 * "confirm launch" / "cancel launch" replies. Null when the tweet is neither.
 */
export async function handleFundedLaunchMention(postId: string, handle: string, text: string, iconUrl: string | null): Promise<string | null> {
  const db = await admin();
  if (isConfirmLaunch(text) || isCancelLaunch(text)) {
    const { data: pending } = await db.from("funded_launches").select("id, x_post_id")
      .eq("x_username", handle.toLowerCase()).eq("status", "staged").gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!pending || pending.x_post_id === postId) return `@${handle} no launch waiting for confirmation (reviews expire after 10 min).`;
    if (isCancelLaunch(text)) return (await cancelFundedLaunch(pending.id)) ? `@${handle} launch cancelled. Nothing moved.` : "";
    const r = await confirmFundedLaunch(pending.id);
    return `@${handle} ${r.message}${r.link ? ` ${r.link}` : ""}`.slice(0, 280);
  }
  const parsed = parseFundWith(text);
  if (!parsed) return null;
  const { readDeployRequest } = await import("./xLauncher.server");
  const request = await readDeployRequest(parsed.rest);
  if (!request) return null;
  const { data: w } = await db.from("bank_wallets").select(COLS).ilike("x_username", handle).maybeSingle();
  if (!w) return `@${handle} you don't have an OurBank wallet yet. Sign in at https://ourblast.xyz/terminal to get one.`;
  const r = await stageFundedLaunch({ postId, wallet: w as Wallet, handle, fund: parsed.fund, request, iconUrl, tweetText: text });
  if (!r.ok || !r.id) return r.message ? `@${handle} ${r.message}`.slice(0, 280) : "";
  // The command itself is the instruction: start right away, no confirm reply.
  const c = await confirmFundedLaunch(r.id);
  return `@${handle} ${c.message}${c.link ? ` ${c.link}` : ""}`.slice(0, 280);
}

/** Poll job: launches funded requests whose SUI has arrived; times out the rest. */
export async function maintainFundedLaunches(): Promise<void> {
  const db = await admin();
  const { data: rows } = await db.from("funded_launches").select("*").eq("status", "bridging").not("bridged_at", "is", null).limit(20);
  for (const row of rows ?? []) {
    try {
      const have = await suiBalance(row.sui_address);
      if (have >= requiredBalanceMist(row.launchpad)) {
        const { data: claimed } = await db.from("funded_launches").update({ status: "launching", updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "bridging").select("id").maybeSingle();
        if (!claimed) continue;
        const { executeLaunchRequest } = await import("./xLauncher.server");
        const out = await executeLaunchRequest(row.launch_request_id);
        await db.from("funded_launches").update({ status: out.status === "DEPLOYED" ? "launched" : "failed", notice: out.notice, updated_at: new Date().toISOString() }).eq("id", row.id);
      } else if (Date.now() - Date.parse(row.bridged_at as string) > FUNDED_ARRIVAL_TIMEOUT_MS) {
        const notice = "Not enough SUI arrived within 2 hours. Anything that arrived is in your OurBank Sui wallet; launch again from there.";
        await db.from("funded_launches").update({ status: "failed", notice, updated_at: new Date().toISOString() }).eq("id", row.id);
        await db.from("x_launch_requests").update({ status: "FAILED", notice }).eq("id", row.launch_request_id).eq("status", "PENDING");
      }
    } catch (e) {
      console.error(`Funded launch ${row.id}`, e);
    }
  }
}

/** Terminal: stage from typed text for the signed-in user. */
export async function stageFundedLaunchForUser(userId: string, text: string): Promise<{ ok: boolean; message: string; id?: string } | null> {
  const parsed = parseFundWith(text);
  if (!parsed) return null;
  const { readDeployRequest } = await import("./xLauncher.server");
  const request = await readDeployRequest(parsed.rest);
  if (!request) return null;
  const db = await admin();
  const { data: w } = await db.from("bank_wallets").select(COLS).eq("user_id", userId).maybeSingle();
  if (!w) return { ok: false, message: "No OurBank wallet yet. Open the OurBank card first." };
  const postId = `terminal-${userId}-${request.symbol.toUpperCase()}-funded-${Date.now()}`;
  return stageFundedLaunch({ postId, wallet: w as Wallet, handle: (w as Wallet).x_username, fund: parsed.fund, request, tweetText: parsed.rest });
}
