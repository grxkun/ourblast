// SPDX-License-Identifier: BUSL-1.1
import { findBankWallet, findBankWalletByUserId, sendFromBankWallet, SUI_TYPE } from "./bank-wallet.server";
import { HOP_TIMEOUT_MS, hopLeg2Lamports, SUI_OUT_GAS_KEEP, suiOutProblem, TARGET_LABEL, type SuiOutTarget } from "./suiOut";

type Out = { ok: boolean; message: string; link?: string };
type Wallet = NonNullable<Awaited<ReturnType<typeof findBankWallet>>>;

const ONECLICK = "https://1click.chaindefuser.com/v0";
const ONECLICK_ASSET = { SUI: "nep141:sui.omft.near", SOL: "nep141:sol.omft.near", ETH_BASE: "nep141:base.omft.near", ETH_ARB: "nep141:arb.omft.near" } as const;
const SOL_CHAIN = 792703809;
const NATIVE_SOL = "11111111111111111111111111111111";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function suiBalance(address: string): Promise<number> {
  const { bankBalances } = await import("./bank-wallet.server");
  const b = (await bankBalances(address)).find((x) => x.coinType === SUI_TYPE);
  return Number(b?.balance ?? 0n) / 1e9;
}

async function oneClickQuote(origin: string, dest: string, amount: bigint, recipient: string, refundTo: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const jwt = process.env["ONECLICK_JWT"];
  if (jwt) headers["authorization"] = `Bearer ${jwt}`;
  const res = await fetch(`${ONECLICK}/quote`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      dry: false, swapType: "EXACT_INPUT", slippageTolerance: 300,
      originAsset: origin, depositType: "ORIGIN_CHAIN", amount: amount.toString(),
      destinationAsset: dest, recipient, recipientType: "DESTINATION_CHAIN",
      refundTo, refundType: "ORIGIN_CHAIN", deadline: new Date(Date.now() + 3_600_000).toISOString(),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string; quote?: { depositAddress?: string; amountOut?: string; amountOutFormatted?: string } };
  if (!res.ok || !json.quote?.depositAddress) throw new Error(json.message ?? `quote failed (${res.status})`);
  return { deposit: json.quote.depositAddress, out: json.quote.amountOutFormatted ?? "?", outAtomic: BigInt(json.quote.amountOut ?? "0") };
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

async function run(wallet: Wallet | null, amountSui: number, target: SuiOutTarget, destination?: string): Promise<Out> {
  if (!wallet) return { ok: false, message: "No OurBank wallet yet." };
  const { ensureSolDepositAddress } = await import("./bank-sol.server");
  const hop = target !== "SOL";
  // Leg 1 always lands on SOL: the user's own OurBank Solana address for hops.
  const solAddr = hop ? await ensureSolDepositAddress(wallet.x_username) : (destination ?? (await ensureSolDepositAddress(wallet.x_username)));
  if (!solAddr) return { ok: false, message: "No Solana address to send to — add one: bridge 10 sui to sol <address>" };
  let evm: string | null = null;
  if (hop) {
    const { ensureEvmDepositAddress } = await import("./bank-evm.server");
    evm = destination ?? (await ensureEvmDepositAddress(wallet.x_username));
    if (!evm) return { ok: false, message: "No EVM address to send to — add one: bridge 10 sui to bnb 0x…" };
  }
  const problem = suiOutProblem(amountSui, await suiBalance(wallet.address));
  if (problem) return { ok: false, message: `Bridge failed, nothing was sent: ${problem}` };

  const db = await admin();
  let hopId: string | null = null;
  if (hop) {
    const { balances } = await import("./sol-sweep.server");
    const baseline = (await balances(solAddr)).lamports;
    const { data, error } = await db.from("sui_out_hops").insert({
      user_id: wallet.user_id ?? null, x_username: wallet.x_username, target, amount_sui: amountSui,
      sol_address: solAddr, evm_recipient: evm!, sol_baseline: baseline as unknown as number, sol_expected: 0,
    }).select("id").single();
    if (error || !data) return { ok: false, message: "Bridge failed, nothing was sent: an earlier SUI → EVM bridge is still in progress. Try again once it finishes." };
    hopId = data.id;
  }
  const fail = async (m: string): Promise<Out> => {
    if (hopId) await db.from("sui_out_hops").update({ status: "failed", error: m.slice(0, 300), updated_at: new Date().toISOString() }).eq("id", hopId);
    return { ok: false, message: `Bridge failed, nothing was sent: ${m}` };
  };

  const mist = BigInt(Math.floor(amountSui * 1e9));
  let q: Awaited<ReturnType<typeof oneClickQuote>>;
  try {
    q = await oneClickQuote(ONECLICK_ASSET.SUI, ONECLICK_ASSET.SOL, mist, solAddr, wallet.address);
  } catch (e) {
    return fail((e as Error).message);
  }
  const sent = await sendFromBankWallet(wallet, SUI_TYPE, mist, q.deposit);
  if (!sent.ok) return fail(sent.error ?? "send failed");
  const link = `https://suiscan.xyz/mainnet/tx/${sent.digest}`;
  if (!hop) {
    return { ok: true, message: `Bridging ${amountSui} SUI → ≈${q.out} SOL to ${short(solAddr)} (~30s). ${SUI_OUT_GAS_KEEP} SUI stays for fees.`, link };
  }
  await db.from("sui_out_hops").update({ sol_expected: q.outAtomic as unknown as number, sui_digest: sent.digest, updated_at: new Date().toISOString() }).eq("id", hopId!);
  return {
    ok: true,
    message: `Bridging ${amountSui} SUI → ≈${q.out} SOL (your OurBank Solana) → ${TARGET_LABEL[target]} to ${short(evm!)}. Takes ~1–2 min; 0.003 SOL stays on Solana for fees.`,
    link,
  };
}

async function relaySolToBnb(solAddr: string, recipient: string, lamports: bigint) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const key = process.env["RELAY_API_KEY"];
  if (key) headers["x-api-key"] = key;
  const res = await fetch("https://api.relay.link/quote", {
    method: "POST",
    headers,
    body: JSON.stringify({
      user: solAddr, recipient, originChainId: SOL_CHAIN, destinationChainId: 56,
      originCurrency: NATIVE_SOL, destinationCurrency: "0x0000000000000000000000000000000000000000",
      amount: lamports.toString(), tradeType: "EXACT_INPUT",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  type RIx = { programId: string; data: string; keys: { pubkey: string; isSigner: boolean; isWritable: boolean }[] };
  const json = (await res.json().catch(() => ({}))) as { message?: string; details?: { currencyOut?: { amountFormatted?: string } }; steps?: { items: { data: { instructions?: RIx[] } }[] }[] };
  const ixs = json.steps?.flatMap((s) => s.items.flatMap((i) => i.data.instructions ?? [])) ?? [];
  if (!res.ok || !ixs.length) throw new Error(`SOL→BNB quote failed: ${json.message ?? res.status}`);
  return { ixs: ixs.map((i) => ({ programId: i.programId, keys: i.keys, data: Uint8Array.from(Buffer.from(i.data, "hex")) })), out: json.details?.currencyOut?.amountFormatted ?? "?" };
}

/**
 * Leg 2 of SUI → SOL → ETH/BNB: once leg 1's SOL lands on the user's OurBank
 * Solana address, send exactly that SOL on. Each row is claimed sent → hopping
 * atomically, so leg 2 can only ever be sent once.
 */
export async function maintainSuiOutHops(): Promise<void> {
  const db = await admin();
  const { data: rows } = await db.from("sui_out_hops").select("*").eq("status", "sent").not("sui_digest", "is", null).limit(20);
  if (!rows?.length) return;
  const { balances, sendFromOurBankSol } = await import("./sol-sweep.server");
  const { compileLegacyMessage, solTransferMessage } = await import("./sol-sweep");
  for (const r of rows) {
    const now = new Date().toISOString();
    try {
      const amt = hopLeg2Lamports((await balances(r.sol_address)).lamports, BigInt(r.sol_baseline), BigInt(r.sol_expected));
      if (amt === null) {
        if (Date.now() - Date.parse(r.created_at) > HOP_TIMEOUT_MS) {
          await db.from("sui_out_hops").update({ status: "failed", error: "SOL didn't arrive within 1h; anything that arrived stays in your OurBank Solana wallet.", updated_at: now }).eq("id", r.id);
        }
        continue;
      }
      const { data: claimed } = await db.from("sui_out_hops").update({ status: "hopping", updated_at: now }).eq("id", r.id).eq("status", "sent").select("id").maybeSingle();
      if (!claimed) continue;
      let sig: string;
      let out: string;
      if (r.target === "BNB") {
        const q = await relaySolToBnb(r.sol_address, r.evm_recipient, amt);
        sig = await sendFromOurBankSol(r.sol_address, (bh) => compileLegacyMessage(r.sol_address, q.ixs, bh));
        out = `${q.out} BNB`;
      } else {
        const q = await oneClickQuote(ONECLICK_ASSET.SOL, ONECLICK_ASSET[r.target as "ETH_BASE" | "ETH_ARB"], amt, r.evm_recipient, r.sol_address);
        sig = await sendFromOurBankSol(r.sol_address, (bh) => solTransferMessage(r.sol_address, q.deposit, amt, bh));
        await fetch(`${ONECLICK}/deposit/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ txHash: sig, depositAddress: q.deposit }), signal: AbortSignal.timeout(10_000) }).catch(() => null);
        out = `${q.out} ETH`;
      }
      await db.from("sui_out_hops").update({ status: "done", leg2_tx: sig, out_formatted: out, updated_at: new Date().toISOString() }).eq("id", r.id);
    } catch (e) {
      // Only reached before or during the send; the SOL stays on the user's OurBank Solana address.
      console.error(`SUI→EVM hop ${r.id} failed`, e);
      await db.from("sui_out_hops").update({ status: "failed", error: `${(e as Error).message.slice(0, 250)} — your SOL stays in your OurBank Solana wallet.`, updated_at: new Date().toISOString() }).eq("id", r.id);
    }
  }
}

export async function bridgeSuiOutForUser(userId: string, amountSui: number, target: SuiOutTarget, destination?: string) {
  return run(await findBankWalletByUserId(userId), amountSui, target, destination);
}

export async function bridgeSuiOutForXHandle(handle: string, amountSui: number, target: SuiOutTarget, destination?: string): Promise<string> {
  const r = await run(await findBankWallet(handle), amountSui, target, destination);
  return `@${handle} ${r.message}${r.link ? ` ${r.link}` : ""}`.slice(0, 280);
}
