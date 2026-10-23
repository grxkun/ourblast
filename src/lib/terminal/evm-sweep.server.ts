// SPDX-License-Identifier: BUSL-1.1
import {
  createPublicClient,
  defineChain,
  encodeFunctionData,
  erc20Abi,
  http,
  keccak256,
  recoverAddress,
  serializeTransaction,
  type Hex,
  type TransactionSerializable,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { decryptConnectionKey } from "@/lib/connection-key.server";
import { BNB_GAS_KEEP, BNB_MIN, ETH_GAS_KEEP, ETH_MIN, decodeSolHop, encodeSolHop, ethSweepAmount, NATIVE, solHopAmount, SWEEP_CHAINS, sweepAllowed, usdcSweepAmount, type SweepChain, type SweepToken } from "./evm-sweep";

/**
 * Phase 3 of multi-chain OurBank: moves ETH/USDC that lands on a user's OurBank
 * EVM address into their OurBank Sui wallet (Mayan), then the existing
 * cross-chain order auto-buys $BLAST. Robinhood ETH hops to Arbitrum first
 * (Relay). Off unless EVM_SWEEP_ALLOW names the handle (or "*").
 */
const BLAST = "0x577a8addf60a34d4c705914ad066a3b28c3fc40d365ed0d9dfc408f29b4725d3::blast::BLAST";
const SCAN_EVERY_MS = 60_000;

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

function client(chain: SweepChain) {
  const c = SWEEP_CHAINS[chain];
  return createPublicClient({
    chain: defineChain({ id: c.id, name: chain, nativeCurrency: { name: c.native, symbol: c.native, decimals: 18 }, rpcUrls: { default: { http: [c.rpc] } } }),
    transport: http(c.rpc, { timeout: 15_000 }),
  });
}

interface EvmWalletRow {
  x_username: string;
  user_id: string | null;
  address: string;
  evm_address: string;
  evm_secret_ciphertext: string | null;
  evm_signing_backend: string | null;
  sol_address?: string | null;
}

/** Signs and broadcasts one EVM transaction from an OurBank EVM address. */
async function sendTx(chain: SweepChain, w: EvmWalletRow, tx: { to: Hex; data?: Hex; value?: bigint }): Promise<Hex> {
  const pc = client(chain);
  const from = w.evm_address as Hex;
  const prepared = await pc.prepareTransactionRequest({ account: from, to: tx.to, data: tx.data, value: tx.value ?? 0n, chain: pc.chain });
  const unsigned: TransactionSerializable = {
    type: "eip1559",
    chainId: SWEEP_CHAINS[chain].id,
    nonce: prepared.nonce,
    to: tx.to,
    data: tx.data,
    value: tx.value ?? 0n,
    gas: (prepared.gas * 12n) / 10n,
    maxFeePerGas: prepared.maxFeePerGas,
    maxPriorityFeePerGas: prepared.maxPriorityFeePerGas,
  };
  let raw: Hex;
  if (w.evm_signing_backend === "turnkey") {
    const { signEvmDigest } = await import("./turnkey.server");
    const hash = keccak256(serializeTransaction(unsigned));
    const sig = await signEvmDigest(w.evm_address, hash);
    const signer = await recoverAddress({ hash, signature: { r: sig.r, s: sig.s, yParity: sig.yParity } });
    if (signer.toLowerCase() !== from.toLowerCase()) throw new Error("EVM signature check failed.");
    raw = serializeTransaction(unsigned, { r: sig.r, s: sig.s, yParity: sig.yParity });
  } else {
    if (!w.evm_secret_ciphertext) throw new Error("EVM wallet has no key.");
    const account = privateKeyToAccount(`0x${decryptConnectionKey(w.evm_secret_ciphertext)}`);
    if (account.address.toLowerCase() !== from.toLowerCase()) throw new Error("EVM key mismatch.");
    raw = await account.signTransaction(unsigned);
  }
  return pc.sendRawTransaction({ serializedTransaction: raw });
}

/** Opens (or reuses) a cross-chain order so arriving SUI is auto-swapped to $BLAST. */
export async function ensureOrder(w: Pick<EvmWalletRow, "user_id" | "x_username" | "address">, forceBuy = false): Promise<string | null> {
  if (!w.user_id) return null;
  const db = await admin();
  // "Keep as SUI": bridge only, no auto-buy order.
  const { data: pref } = await db.from("bank_preferences").select("deposit_action").eq("user_id", w.user_id).maybeSingle();
  if (!forceBuy && pref?.deposit_action === "keep_sui") return null;
  const { data: open } = await db.from("cross_chain_orders").select("id").eq("user_id", w.user_id).eq("status", "pending").maybeSingle();
  const { walletBalances } = await import("./crossChain.server");
  const bal = await walletBalances(w.address);
  if (open) {
    // Arrival can take ~20 min (Mayan MCTP): keep the order alive long enough.
    await db.from("cross_chain_orders").update({ expires_at: new Date(Date.now() + 3 * 3_600_000).toISOString() }).eq("id", open.id);
    return open.id;
  }
  const { data, error } = await db
    .from("cross_chain_orders")
    .insert({
      user_id: w.user_id,
      x_username: w.x_username,
      wallet: w.address,
      target_coin: BLAST,
      baseline_sui: bal.sui.toString() as unknown as number,
      baseline_usdc: bal.usdc.toString() as unknown as number,
      expires_at: new Date(Date.now() + 3 * 3_600_000).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

// REST quote + viem encoding (the Mayan SDK crashes the edge runtime).
async function mayanTx(chain: SweepChain, w: EvmWalletRow, token: string, amount: bigint): Promise<{ to: Hex; data: Hex; value: bigint }> {
  const { fetchMayanQuote, fetchMayanRouterSwap, buildMayanTx } = await import("./mayan-evm");
  const quote = await fetchMayanQuote(chain, token, amount);
  const router = token === NATIVE ? await fetchMayanRouterSwap(quote) : undefined;
  return buildMayanTx(quote, w.address, router);
}

async function relayTxs(w: EvmWalletRow, amount: bigint) {
  const key = process.env["RELAY_API_KEY"];
  if (!key) throw new Error("Robinhood route needs a Relay API key.");
  const res = await fetch("https://api.relay.link/quote/v2", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify({
      user: w.evm_address,
      recipient: w.evm_address,
      originChainId: SWEEP_CHAINS.robinhood.id,
      destinationChainId: SWEEP_CHAINS.arbitrum.id,
      originCurrency: NATIVE,
      destinationCurrency: NATIVE,
      amount: amount.toString(),
      tradeType: "EXACT_INPUT",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json()) as { message?: string; steps?: { kind: string; items: { data: { to: string; data: string; value?: string; chainId: number } }[] }[] };
  if (!res.ok || !json.steps) throw new Error(`Relay quote failed: ${json.message ?? res.status}`);
  const txs = json.steps.filter((s) => s.kind === "transaction").flatMap((s) => s.items.map((i) => i.data));
  if (txs.some((t) => t.chainId !== SWEEP_CHAINS.robinhood.id)) throw new Error("Relay returned an unexpected chain.");
  return txs.map((t) => ({ to: t.to as Hex, data: t.data as Hex, value: BigInt(t.value ?? "0") }));
}

/** NEAR Intents 1Click: quote native BNB → SUI and return the BSC deposit address to pay. */
async function intentsBnbDeposit(w: EvmWalletRow, amount: bigint): Promise<Hex> {
  // 1Click's bot check rejects requests without a User-Agent.
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "ourblast-bridge/1.0" };
  const jwt = process.env["ONECLICK_JWT"];
  if (jwt) { headers["authorization"] = `Bearer ${jwt}`; headers["x-api-key"] = jwt; }
  const res = await fetch("https://1click.chaindefuser.com/v0/quote", {
    method: "POST",
    headers,
    body: JSON.stringify({
      dry: false, swapType: "EXACT_INPUT", slippageTolerance: 300,
      originAsset: "nep245:v2_1.omni.hot.tg:56_11111111111111111111", depositType: "ORIGIN_CHAIN", amount: amount.toString(),
      destinationAsset: "nep141:sui.omft.near", recipient: w.address, recipientType: "DESTINATION_CHAIN",
      refundTo: w.evm_address, refundType: "ORIGIN_CHAIN",
      deadline: new Date(Date.now() + 3_600_000).toISOString(),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json()) as { message?: string; quote?: { depositAddress?: string } };
  const dep = json.quote?.depositAddress;
  if (!res.ok || !dep) throw new Error(`NEAR Intents quote failed: ${json.message ?? res.status}`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(dep)) throw new Error("NEAR Intents returned a bad deposit address.");
  return dep as Hex;
}

/** Relay: native BNB on BSC → native SOL at the user's OurBank Solana address. */
async function relayBnbToSol(w: EvmWalletRow, amount: bigint): Promise<{ txs: { to: Hex; data: Hex; value: bigint }[]; outLamports: bigint }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const key = process.env["RELAY_API_KEY"];
  if (key) headers["x-api-key"] = key;
  const res = await fetch("https://api.relay.link/quote", {
    method: "POST",
    headers,
    body: JSON.stringify({
      user: w.evm_address, recipient: w.sol_address,
      originChainId: SWEEP_CHAINS.bsc.id, destinationChainId: 792703809,
      originCurrency: NATIVE, destinationCurrency: "11111111111111111111111111111111",
      amount: amount.toString(), tradeType: "EXACT_INPUT",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json()) as { message?: string; details?: { currencyOut?: { amount?: string } }; steps?: { kind: string; items: { data: { to: string; data: string; value?: string; chainId: number } }[] }[] };
  if (!res.ok || !json.steps) throw new Error(`BNB→SOL quote failed: ${json.message ?? res.status}`);
  const out = BigInt(json.details?.currencyOut?.amount ?? "0");
  if (out <= 0n) throw new Error("BNB→SOL quote returned nothing.");
  const txs = json.steps.filter((s) => s.kind === "transaction").flatMap((s) => s.items.map((i) => i.data));
  if (!txs.length || txs.some((t) => t.chainId !== SWEEP_CHAINS.bsc.id)) throw new Error("BNB→SOL quote returned an unexpected transaction.");
  return { txs: txs.map((t) => ({ to: t.to as Hex, data: t.data as Hex, value: BigInt(t.value ?? "0") })), outLamports: out };
}

/**
 * Second leg of BNB → SOL → SUI: once Relay's SOL lands on the user's OurBank
 * Solana address, bridge exactly that SOL to Sui. Each row hops at most once
 * (claimed sent → hopping atomically). Runs on user-started sweeps only.
 */
/**
 * User-requested retry of a SOL → SUI second leg that failed (e.g. no quote).
 * The first leg already delivered SOL to their own Solana address, so this only
 * re-arms hop_failed rows; the atomic sent → hopping claim still sends once.
 */
export async function retryBnbSolHopsForUser(userId: string): Promise<string> {
  const db = await admin();
  const { data: rows } = await db.from("evm_sweeps").update({ status: "sent", error: null, updated_at: new Date().toISOString() })
    .eq("user_id", userId).eq("route", "relay_sol").eq("status", "hop_failed").select("id");
  if (!rows?.length) return "Nothing to retry — no stalled BNB → SOL → SUI hop.";
  await maintainBnbSolHops(userId);
  const { data: after } = await db.from("evm_sweeps").select("status, error").in("id", rows.map((r) => r.id));
  const ok = (after ?? []).filter((r) => r.status === "hopped").length;
  const err = (after ?? []).find((r) => r.status === "hop_failed")?.error;
  if (ok) return `✅ SOL → SUI hop sent for ${ok} bridge(s). Track with /bridges.`;
  return `⚠️ SOL → SUI still unavailable${err ? `: ${err}` : ""}. Your SOL stays safe in your OurBank Solana wallet — try "retry hop" later.`;
}

export async function maintainBnbSolHops(onlyUser?: string): Promise<void> {
  const db = await admin();
  await confirmSubmitted();
  let q = db.from("evm_sweeps").select("id, user_id, approve_tx, updated_at").eq("route", "relay_sol").eq("status", "sent");
  if (onlyUser) q = q.eq("user_id", onlyUser);
  const { data: rows } = await q.limit(20);
  for (const r of rows ?? []) {
    const hop = decodeSolHop(r.approve_tx);
    if (!hop || !r.user_id) continue;
    try {
      const { data: w } = await db.from("bank_wallets").select("sol_address").eq("user_id", r.user_id).maybeSingle();
      if (!w?.sol_address) continue;
      const { balances, bridgeSolNowForUser } = await import("./sol-sweep.server");
      const { lamports } = await balances(w.sol_address);
      const amt = solHopAmount(hop.lamports, lamports);
      if (amt === 0n) {
        if (Date.now() - Date.parse(r.updated_at) > 3_600_000) {
          await db.from("evm_sweeps").update({ status: "hop_failed", error: "SOL didn't arrive within 1h — anything that lands stays in your Solana wallet.", updated_at: new Date().toISOString() }).eq("id", r.id);
        }
        continue;
      }
      const { data: claimed } = await db.from("evm_sweeps").update({ status: "hopping", updated_at: new Date().toISOString() }).eq("id", r.id).eq("status", "sent").select("id").maybeSingle();
      if (!claimed) continue;
      const res = await bridgeSolNowForUser(r.user_id, Number(amt) / 1e9, hop.keep ? "keep" : false);
      await db.from("evm_sweeps").update({ status: res.ok ? "hopped" : "hop_failed", error: res.ok ? null : res.message.slice(0, 300), updated_at: new Date().toISOString() }).eq("id", r.id);
    } catch (e) {
      console.error(`BNB→SOL hop ${r.id}`, e);
    }
  }
}

/** Claims, sends and records one sweep. Never throws. */
async function sweep(chain: SweepChain, w: EvmWalletRow, token: SweepToken, amount: bigint, keep = false): Promise<{ ok: true; hash: string } | { ok: false; error: string }> {
  const db = await admin();
  const route = SWEEP_CHAINS[chain].route;
  const { data: claimed, error } = await db
    .from("evm_sweeps")
    .insert({ x_username: w.x_username, user_id: w.user_id, evm_address: w.evm_address, chain, token, amount_atomic: amount.toString() as unknown as number, route })
    .select("id")
    .single();
  if (error || !claimed) return { ok: false, error: "An earlier bridge from this address is still in progress." }; // unique in-flight index
  let hashSent: string | undefined;
  try {
    let approveTx: string | null = null;
    let hash: Hex;
    let orderId: string | null = null;
    if (route === "relay") {
      const txs = await relayTxs(w, amount);
      if (!txs.length) throw new Error("Relay returned no transaction.");
      for (const t of txs) hashSent = hash = await sendTx(chain, w, t);
      hash = hash!;
    } else if (route === "intents") {
      const direct = await intentsBnbDeposit(w, amount).then((to) => ({ to }), (e: Error) => ({ err: e }));
      if ("to" in direct) {
        orderId = keep ? null : await ensureOrder(w);
        hashSent = hash = await sendTx(chain, w, { to: direct.to, value: amount });
      } else {
        // 1Click refuses small BNB swaps at times: hop BNB → SOL (Relay) into the
        // user's own OurBank Solana address; maintainBnbSolHops sends it on to Sui.
        if (!w.sol_address) throw direct.err;
        const hop = await relayBnbToSol(w, amount);
        for (const t of hop.txs) hashSent = hash = await sendTx(chain, w, t);
        hash = hash!;
        await db.from("evm_sweeps").update({ route: "relay_sol", approve_tx: encodeSolHop(hop.outLamports, keep) }).eq("id", claimed.id);
      }
    } else {
      orderId = keep ? null : await ensureOrder(w);
      const usdc = SWEEP_CHAINS[chain].usdc!;
      const tx = await mayanTx(chain, w, token === "ETH" ? NATIVE : usdc, amount);
      if (token === "USDC") {
        const pc = client(chain);
        const allowance = await pc.readContract({ address: usdc as Hex, abi: erc20Abi, functionName: "allowance", args: [w.evm_address as Hex, tx.to] });
        if (allowance < amount) {
          approveTx = await sendTx(chain, w, { to: usdc as Hex, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [tx.to, amount] }) });
          await pc.waitForTransactionReceipt({ hash: approveTx as Hex, timeout: 60_000 });
        }
      }
      hashSent = hash = await sendTx(chain, w, tx);
    }
    // Never overwrite approve_tx with null: the relay_sol route stores its SOL
    // hop note there, and wiping it would strand the second leg forever.
    const done = { status: "submitted", tx_hash: hash, order_id: orderId, updated_at: new Date().toISOString(), ...(approveTx ? { approve_tx: approveTx } : {}) };
    await db.from("evm_sweeps").update(done).eq("id", claimed.id);
    return { ok: true, hash };
  } catch (e) {
    const m = (e as Error).message.slice(0, 300);
    // If a transaction already went out, never record it as "nothing was sent".
    const sent = typeof hashSent === "string";
    await db.from("evm_sweeps").update(sent
      ? { status: "submitted", tx_hash: hashSent ?? null, error: `Recorded after error: ${m}`.slice(0, 300), updated_at: new Date().toISOString() }
      : { status: "failed", error: m, updated_at: new Date().toISOString() }).eq("id", claimed.id);
    console.error(`EVM sweep ${claimed.id} failed`, e);
    if (sent) return { ok: true, hash: hashSent as string };
    return { ok: false, error: `Bridge failed, nothing was sent: ${m}` };
  }
}

/** Confirms submitted sweeps so the address can be swept again. */
async function confirmSubmitted() {
  const db = await admin();
  const { data: rows } = await db.from("evm_sweeps").select("id, chain, tx_hash, created_at").eq("status", "submitted").limit(50);
  for (const r of rows ?? []) {
    try {
      const receipt = await client(r.chain as SweepChain).getTransactionReceipt({ hash: r.tx_hash as Hex }).catch(() => null);
      if (receipt) {
        await db.from("evm_sweeps").update({ status: receipt.status === "success" ? "sent" : "failed", error: receipt.status === "success" ? null : "Transaction reverted.", updated_at: new Date().toISOString() }).eq("id", r.id);
      } else if (Date.now() - Date.parse(r.created_at) > 3_600_000) {
        await db.from("evm_sweeps").update({ status: "failed", error: "Not mined after 1h.", updated_at: new Date().toISOString() }).eq("id", r.id);
      }
    } catch (e) {
      console.error(`EVM sweep confirm ${r.id}`, e);
    }
  }
}

/** EVM_SWEEP_PUBLIC=1 opens sweeps to everyone (public test); else EVM_SWEEP_ALLOW. */
export function sweepSetting(): string | undefined {
  return process.env["EVM_SWEEP_PUBLIC"] === "1" ? "*" : process.env["EVM_SWEEP_ALLOW"];
}

export async function maintainEvmSweeps(): Promise<void> {
  const setting = sweepSetting();
  if (!setting?.trim()) return;
  const db = await admin();
  const { data: state } = await db.from("x_bot_state").select("last_evm_scan_at").eq("id", true).maybeSingle();
  if (state?.last_evm_scan_at && Date.now() - Date.parse(state.last_evm_scan_at) < SCAN_EVERY_MS) return;
  await db.from("x_bot_state").update({ last_evm_scan_at: new Date().toISOString() }).eq("id", true);

  await confirmSubmitted();
  const { data: wallets } = await db
    .from("bank_wallets")
    .select("x_username, user_id, address, evm_address, evm_secret_ciphertext, evm_signing_backend, sol_address")
    .not("evm_address", "is", null)
    .limit(500);
  for (const w of (wallets ?? []) as EvmWalletRow[]) {
    if (!sweepAllowed(setting, w.x_username)) continue;
    await scanWallet(w);
  }
}

export interface ManualBridgeLine { chain: SweepChain; token: SweepToken; amount: string; status: string; txHash: string | null; error: string | null }

/** Checks every chain for one wallet and sweeps what is eligible. Returns what happened per chain. */
async function scanWallet(w: EvmWalletRow): Promise<ManualBridgeLine[]> {
  const db = await admin();
  const out: ManualBridgeLine[] = [];
  for (const chain of Object.keys(SWEEP_CHAINS) as SweepChain[]) {
    try {
      const pc = client(chain);
      const eth = await pc.getBalance({ address: w.evm_address as Hex });
      const usdcAddr = SWEEP_CHAINS[chain].usdc;
      let token: SweepToken | null = null;
      let amount = 0n;
      if (usdcAddr) {
        const usdc = await pc.readContract({ address: usdcAddr as Hex, abi: erc20Abi, functionName: "balanceOf", args: [w.evm_address as Hex] });
        const u = usdcSweepAmount(usdc, eth);
        if (u.amount > 0n) { token = "USDC"; amount = u.amount; }
      }
      if (!token) {
        const native = SWEEP_CHAINS[chain].native;
        const e = ethSweepAmount(eth, native);
        if (e > 0n) { token = native; amount = e; }
      }
      if (!token) continue;
      const startedAt = new Date().toISOString();
      await sweep(chain, w, token, amount);
      const { data: row } = await db
        .from("evm_sweeps")
        .select("status, tx_hash, error, created_at")
        .eq("evm_address", w.evm_address).eq("chain", chain).eq("token", token)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const fresh = row && row.created_at >= startedAt;
      out.push({
        chain, token,
        amount: token !== "USDC" ? (Number(amount) / 1e18).toFixed(6) : (Number(amount) / 1e6).toFixed(2),
        status: fresh ? row.status : "already_in_flight",
        txHash: fresh ? row.tx_hash : null,
        error: fresh ? row.error : null,
      });
      if (token === "USDC") continue; // ETH waits for the next pass so USDC fees are never starved
    } catch (e) {
      console.error(`EVM scan ${w.x_username}/${chain}`, e);
    }
  }
  return out;
}

/** Manual "bridge now" for the signed-in user's own OurBank EVM address. */
export async function bridgeNowForUser(userId: string): Promise<{ ok: boolean; message: string; lines: ManualBridgeLine[] }> {
  const db = await admin();
  const { data: w } = await db
    .from("bank_wallets")
    .select("x_username, user_id, address, evm_address, evm_secret_ciphertext, evm_signing_backend, sol_address")
    .eq("user_id", userId).not("evm_address", "is", null).maybeSingle();
  if (!w) return { ok: false, message: "No OurBank EVM address yet. Open your OurBank card first.", lines: [] };
  if (!sweepAllowed(sweepSetting(), w.x_username)) return { ok: false, message: "Bridging is invite-only during testing.", lines: [] };
  await confirmSubmitted();
  const lines = await scanWallet(w as EvmWalletRow);
  if (!lines.length) return { ok: true, message: "Nothing to bridge yet. Need at least 0.0015 ETH or 2 USDC on Base, Arbitrum or Robinhood, or 0.01 BNB on BNB Chain.", lines };
  return { ok: true, message: "Bridge started. SUI lands in ~20 min, then auto-buys $BLAST.", lines };
}

/**
 * Bridges an exact native amount (ETH on Base/Arbitrum, or BNB) from the user's
 * OurBank EVM address to their Sui wallet with no auto-buy — used to fund a launch.
 */
export async function bridgeEvmAmountForUser(userId: string, asset: "ETH" | "BNB", amount: number): Promise<{ ok: boolean; message: string; txHash?: string; explorer?: string }> {
  const db = await admin();
  const { data: w } = await db
    .from("bank_wallets")
    .select("x_username, user_id, address, evm_address, evm_secret_ciphertext, evm_signing_backend, sol_address")
    .eq("user_id", userId).not("evm_address", "is", null).maybeSingle();
  if (!w) return { ok: false, message: "No OurBank EVM address yet. Open your OurBank card first." };
  if (!sweepAllowed(sweepSetting(), w.x_username)) return { ok: false, message: "Bridging is invite-only during testing." };
  await confirmSubmitted();
  const want = BigInt(Math.round(amount * 1e18));
  const chains: SweepChain[] = asset === "BNB" ? ["bsc"] : ["base", "arbitrum"];
  for (const chain of chains) {
    const bal = await client(chain).getBalance({ address: w.evm_address as Hex }).catch(() => 0n);
    const keep = asset === "BNB" ? 500_000_000_000_000n : 300_000_000_000_000n;
    if (bal < want + keep) continue;
    const r = await sweep(chain, w as EvmWalletRow, asset, want, true);
    if (!r.ok) return { ok: false, message: r.error };
    return { ok: true, txHash: r.hash, explorer: `${SWEEP_CHAINS[chain].explorer}/tx/${r.hash}`, message: `Bridging ${amount} ${asset} from ${chain === "bsc" ? "BNB Chain" : chain}.` };
  }
  return { ok: false, message: `Not enough ${asset}. Keep ${asset === "BNB" ? "0.0005 BNB" : "0.0003 ETH"} extra for network fees${asset === "ETH" ? " (Base or Arbitrum)" : ""}.` };
}

/**
 * Chat command "bridge 0.013 bnb to sui" / "bridge all bnb": exact (or all minus the
 * gas reserve) native amount from the handle's OurBank EVM address to its Sui wallet.
 * Keeps the SUI (no auto-buy). Returns a reply that says plainly whether anything moved.
 */
export async function bridgeEvmForXHandle(handle: string, asset: "ETH" | "BNB", amount: number | "all", only?: "base" | "arbitrum"): Promise<string> {
  const db = await admin();
  const { data: w } = await db
    .from("bank_wallets")
    .select("x_username, user_id, address, evm_address, evm_secret_ciphertext, evm_signing_backend, sol_address")
    .ilike("x_username", handle).not("evm_address", "is", null).maybeSingle();
  if (!w) return "No OurBank EVM address yet — open your wallet to create one. Nothing was sent.";
  if (!sweepAllowed(sweepSetting(), w.x_username)) return "Bridging is invite-only during testing. Nothing was sent.";
  await confirmSubmitted();
  const keep = asset === "BNB" ? BNB_GAS_KEEP : ETH_GAS_KEEP;
  const min = asset === "BNB" ? BNB_MIN : ETH_MIN;
  const chains: SweepChain[] = asset === "BNB" ? ["bsc"] : only ? [only] : ["base", "arbitrum"];
  let best = 0n;
  for (const chain of chains) {
    const bal = await client(chain).getBalance({ address: w.evm_address as Hex }).catch(() => 0n);
    if (bal > best) best = bal;
    const want = amount === "all" ? bal - keep : BigInt(Math.round(amount * 1e18));
    if (want < min || bal < want + keep) continue;
    const r = await sweep(chain, w as EvmWalletRow, asset, want, true);
    const name = chain === "bsc" ? "BNB Chain" : chain === "base" ? "Base" : "Arbitrum";
    const human = Number(want) / 1e18;
    if (!r.ok) return `Bridge failed — nothing was sent. ${r.error}`;
    return `Bridging ${human} ${asset} from ${name} → SUI in your OurBank wallet (kept as SUI). ${SWEEP_CHAINS[chain].explorer}/tx/${r.hash}\nArrives in a few minutes${asset === "BNB" ? " (may hop via Solana)" : ""}. Type balance to check.`;
  }
  const have = (Number(best) / 1e18).toFixed(5);
  const minH = asset === "BNB" ? "0.01 BNB" : "0.0015 ETH";
  const keepH = asset === "BNB" ? "0.0005 BNB" : "0.0003 ETH";
  return `Not enough ${asset} — you have ${have}. Minimum bridge is ${minH}, plus ${keepH} kept for network fees. Nothing was sent.`;
}
