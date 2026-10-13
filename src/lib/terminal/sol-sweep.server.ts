// SPDX-License-Identifier: BUSL-1.1
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";

import { decryptConnectionKey } from "@/lib/connection-key.server";
import { sweepAllowed } from "./evm-sweep";
import { planSolSweep, SOL_FEE_LAMPORTS, SOL_USDC_MINT, signedTxBase64, solTransferMessage, usdcTransferMessage } from "./sol-sweep";

/**
 * OurBank Solana deposits → Sui: SOL/USDC on a user's OurBank Solana address is
 * sent to a NEAR Intents (1Click) deposit address that delivers SUI to their
 * OurBank Sui wallet; the cross-chain order then auto-buys $BLAST.
 * Same gate as EVM sweeps (EVM_SWEEP_PUBLIC / EVM_SWEEP_ALLOW).
 */
const SCAN_EVERY_MS = 60_000;
const ONECLICK = "https://1click.chaindefuser.com/v0";
const ASSET = { SOL: "nep141:sol.omft.near", USDC: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near" } as const;
const SUI_OUT = "nep141:sui.omft.near";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

function rpcUrl() {
  return process.env["SOLANA_RPC_URL"] || "https://api.mainnet-beta.solana.com";
}

const SOL_RPCS = () =>
  [
    process.env["SOLANA_RPC_URL"],
    "https://api.mainnet-beta.solana.com",
    "https://solana-rpc.publicnode.com",
    "https://rpc.ankr.com/solana",
    "https://solana.api.onfinality.io/public",
  ].filter(Boolean) as string[];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tries each Solana RPC in turn, then retries the whole list once after a pause; public endpoints throttle edge IPs. */
async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let last: unknown;
  for (let pass = 0; pass < 2; pass++) {
    if (pass > 0) await sleep(1_200);
    for (const url of SOL_RPCS()) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.status === 429 || res.status === 403) throw new Error(`Solana RPC ${method}: rate limited (${res.status})`);
        const json = (await res.json()) as { result?: T; error?: { message: string } };
        if (json.error || json.result === undefined) throw new Error(`Solana RPC ${method}: ${json.error?.message ?? res.status}`);
        return json.result;
      } catch (e) { last = e; }
    }
  }
  throw new Error("Solana network is congested right now — please try again in a moment.");
}

async function balances(addr: string): Promise<{ lamports: bigint; usdc: bigint }> {
  const bal = await rpc<{ value: number }>("getBalance", [addr, { commitment: "confirmed" }]);
  const toks = await rpc<{ value: { account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }[] }>(
    "getTokenAccountsByOwner", [addr, { mint: SOL_USDC_MINT }, { encoding: "jsonParsed", commitment: "confirmed" }],
  );
  const usdc = toks.value.reduce((n, a) => n + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n);
  return { lamports: BigInt(bal.value), usdc };
}

interface SolWalletRow {
  x_username: string;
  user_id: string | null;
  address: string;
  sol_address: string;
  sol_secret_ciphertext: string | null;
  sol_signing_backend: string | null;
}

async function sign(w: SolWalletRow, msg: Uint8Array): Promise<Uint8Array> {
  let sig: Uint8Array;
  if (w.sol_signing_backend === "turnkey") {
    const { signRawDigest } = await import("./turnkey.server");
    sig = await signRawDigest(w.sol_address, msg);
  } else {
    if (!w.sol_secret_ciphertext) throw new Error("Solana wallet has no key.");
    const secret = Uint8Array.from(Buffer.from(decryptConnectionKey(w.sol_secret_ciphertext), "hex"));
    sig = ed25519.sign(msg, secret);
  }
  if (!ed25519.verify(sig, msg, bs58.decode(w.sol_address))) throw new Error("Solana signature check failed.");
  return sig;
}

/** Asks NEAR Intents for a one-time deposit address that pays SUI to the OurBank Sui wallet. */
async function intentsDeposit(token: "SOL" | "USDC", amount: bigint, w: SolWalletRow): Promise<string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const jwt = process.env["ONECLICK_JWT"];
  if (jwt) headers["authorization"] = `Bearer ${jwt}`;
  const res = await fetch(`${ONECLICK}/quote`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      dry: false, swapType: "EXACT_INPUT", slippageTolerance: 300,
      originAsset: ASSET[token], depositType: "ORIGIN_CHAIN", amount: amount.toString(),
      destinationAsset: SUI_OUT, recipient: w.address, recipientType: "DESTINATION_CHAIN",
      refundTo: w.sol_address, refundType: "ORIGIN_CHAIN",
      deadline: new Date(Date.now() + 3_600_000).toISOString(),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json()) as { message?: string; quote?: { depositAddress?: string } };
  const dep = json.quote?.depositAddress;
  if (!res.ok || !dep) throw new Error(`NEAR Intents quote failed: ${json.message ?? res.status}`);
  if (bs58.decode(dep).length !== 32) throw new Error("NEAR Intents returned a bad deposit address.");
  return dep;
}

/** Claims, sends and records one sweep. Never throws. */
async function sweep(w: SolWalletRow, token: "SOL" | "USDC", amount: bigint) {
  const db = await admin();
  const { data: claimed, error } = await db
    .from("sol_sweeps")
    .insert({ x_username: w.x_username, user_id: w.user_id, sol_address: w.sol_address, token, amount_atomic: amount.toString() as unknown as number })
    .select("id").single();
  if (error || !claimed) return; // another run holds this address (unique in-flight index)
  try {
    const { ensureOrder } = await import("./evm-sweep.server");
    const orderId = await ensureOrder(w);
    const dep = await intentsDeposit(token, amount, w);
    await db.from("sol_sweeps").update({ deposit_address: dep, order_id: orderId }).eq("id", claimed.id);
    const { value } = await rpc<{ value: { blockhash: string } }>("getLatestBlockhash", [{ commitment: "confirmed" }]);
    const msg = token === "SOL" ? solTransferMessage(w.sol_address, dep, amount, value.blockhash) : usdcTransferMessage(w.sol_address, dep, amount, value.blockhash);
    const tx = signedTxBase64(await sign(w, msg), msg);
    const sigStr = await rpc<string>("sendTransaction", [tx, { encoding: "base64", preflightCommitment: "confirmed" }]);
    await db.from("sol_sweeps").update({ status: "submitted", tx_sig: sigStr, updated_at: new Date().toISOString() }).eq("id", claimed.id);
    // Speeds up NEAR Intents pickup; harmless if it fails.
    await fetch(`${ONECLICK}/deposit/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ txHash: sigStr, depositAddress: dep }), signal: AbortSignal.timeout(10_000) }).catch(() => null);
  } catch (e) {
    await db.from("sol_sweeps").update({ status: "failed", error: (e as Error).message.slice(0, 300), updated_at: new Date().toISOString() }).eq("id", claimed.id);
    console.error(`SOL sweep ${claimed.id} failed`, e);
  }
}

/** Confirms submitted sweeps so the address can be swept again. */
export async function confirmSubmitted() {
  const db = await admin();
  const { data: rows } = await db.from("sol_sweeps").select("id, tx_sig, created_at").eq("status", "submitted").limit(50);
  if (!rows?.length) return;
  const st = await rpc<{ value: ({ err: unknown; confirmationStatus?: string } | null)[] }>("getSignatureStatuses", [rows.map((r) => r.tx_sig), { searchTransactionHistory: true }]);
  for (const [i, r] of rows.entries()) {
    const s = st.value[i];
    const now = new Date().toISOString();
    if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) {
      await db.from("sol_sweeps").update({ status: s.err ? "failed" : "sent", error: s.err ? "Transaction failed on Solana." : null, updated_at: now }).eq("id", r.id);
    } else if (!s && Date.now() - Date.parse(r.created_at) > 10 * 60_000) {
      // Blockhash long expired and never landed: safe to retry.
      await db.from("sol_sweeps").update({ status: "failed", error: "Not confirmed after 10 min.", updated_at: now }).eq("id", r.id);
    }
  }
}

async function scanWallet(w: SolWalletRow): Promise<{ token: string; amount: string } | null> {
  const plan = planSolSweep(...Object.values(await balances(w.sol_address)) as [bigint, bigint]);
  if (!plan) return null;
  await sweep(w, plan.token, plan.amount);
  return { token: plan.token, amount: plan.token === "SOL" ? (Number(plan.amount) / 1e9).toFixed(4) : (Number(plan.amount) / 1e6).toFixed(2) };
}

const COLS = "x_username, user_id, address, sol_address, sol_secret_ciphertext, sol_signing_backend";

export async function maintainSolSweeps(): Promise<void> {
  const { sweepSetting } = await import("./evm-sweep.server");
  const setting = sweepSetting();
  if (!setting?.trim()) return;
  const db = await admin();
  const { data: state } = await db.from("x_bot_state").select("last_sol_scan_at").eq("id", true).maybeSingle();
  if (state?.last_sol_scan_at && Date.now() - Date.parse(state.last_sol_scan_at) < SCAN_EVERY_MS) return;
  await db.from("x_bot_state").update({ last_sol_scan_at: new Date().toISOString() }).eq("id", true);

  await confirmSubmitted();
  const { data: wallets } = await db.from("bank_wallets").select(COLS).not("sol_address", "is", null).limit(500);
  const { data: manual } = await db.from("bank_preferences").select("user_id").eq("sol_auto_sweep", false);
  const skip = new Set((manual ?? []).map((m) => m.user_id));
  for (const w of (wallets ?? []) as SolWalletRow[]) {
    if (!sweepAllowed(setting, w.x_username)) continue;
    if (w.user_id && skip.has(w.user_id)) continue; // user bridges chosen amounts by hand
    try { await scanWallet(w); } catch (e) { console.error(`SOL scan ${w.x_username}`, e); }
  }
}

/**
 * Manual "bridge now" for the signed-in user's own OurBank Solana address.
 * With amountSol, bridges only that much SOL and switches auto-sweep off so the rest stays on Solana.
 */
export async function bridgeSolNowForUser(userId: string, amountSol?: number): Promise<{ ok: boolean; message: string }> {
  const db = await admin();
  const { data: w } = await db.from("bank_wallets").select(COLS).eq("user_id", userId).not("sol_address", "is", null).maybeSingle();
  if (!w) return { ok: false, message: "No OurBank Solana address yet." };
  const { sweepSetting } = await import("./evm-sweep.server");
  if (!sweepAllowed(sweepSetting(), w.x_username)) return { ok: false, message: "Bridging is invite-only during testing." };
  await confirmSubmitted();
  if (amountSol !== undefined) {
    if (!(amountSol >= 0.02)) return { ok: false, message: "Minimum is 0.02 SOL." };
    const want = BigInt(Math.round(amountSol * 1e9));
    const { lamports } = await balances(w.sol_address as string);
    if (want + SOL_FEE_LAMPORTS > lamports) return { ok: false, message: `Not enough SOL. Balance ${(Number(lamports) / 1e9).toFixed(4)} SOL (keep 0.000005 for the fee).` };
    const left = lamports - want - SOL_FEE_LAMPORTS;
    if (left > 0n && left < 890_880n) return { ok: false, message: "Leave at least 0.0009 SOL behind (Solana rent), or bridge everything." };
    await db.from("bank_preferences").upsert({ user_id: userId, sol_auto_sweep: false }, { onConflict: "user_id" });
    await sweep(w as SolWalletRow, "SOL", want);
    return { ok: true, message: `Bridging ${amountSol} SOL. The rest stays on Solana (auto-bridge is now off).` };
  }
  const r = await scanWallet(w as SolWalletRow);
  if (!r) return { ok: true, message: "Nothing to bridge from Solana. Need 0.02 SOL, or 2 USDC plus 0.0025 SOL for fees." };
  return { ok: true, message: `Bridging ${r.amount} ${r.token} from Solana. SUI lands in ~1–5 min, then auto-buys $BLAST.` };
}
