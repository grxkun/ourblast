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
import { ethSweepAmount, NATIVE, SWEEP_CHAINS, sweepAllowed, usdcSweepAmount, type SweepChain } from "./evm-sweep";

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
    chain: defineChain({ id: c.id, name: chain, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [c.rpc] } } }),
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
export async function ensureOrder(w: Pick<EvmWalletRow, "user_id" | "x_username" | "address">): Promise<string | null> {
  if (!w.user_id) return null;
  const db = await admin();
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

/** Claims, sends and records one sweep. Never throws. */
async function sweep(chain: SweepChain, w: EvmWalletRow, token: "ETH" | "USDC", amount: bigint) {
  const db = await admin();
  const route = SWEEP_CHAINS[chain].route;
  const { data: claimed, error } = await db
    .from("evm_sweeps")
    .insert({ x_username: w.x_username, user_id: w.user_id, evm_address: w.evm_address, chain, token, amount_atomic: amount.toString() as unknown as number, route })
    .select("id")
    .single();
  if (error || !claimed) return; // another run holds this one (unique in-flight index)
  try {
    let approveTx: string | null = null;
    let hash: Hex;
    let orderId: string | null = null;
    if (route === "relay") {
      const txs = await relayTxs(w, amount);
      if (!txs.length) throw new Error("Relay returned no transaction.");
      for (const t of txs) hash = await sendTx(chain, w, t);
      hash = hash!;
    } else {
      orderId = await ensureOrder(w);
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
      hash = await sendTx(chain, w, tx);
    }
    await db.from("evm_sweeps").update({ status: "submitted", tx_hash: hash, approve_tx: approveTx, order_id: orderId, updated_at: new Date().toISOString() }).eq("id", claimed.id);
  } catch (e) {
    await db.from("evm_sweeps").update({ status: "failed", error: (e as Error).message.slice(0, 300), updated_at: new Date().toISOString() }).eq("id", claimed.id);
    console.error(`EVM sweep ${claimed.id} failed`, e);
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
    .select("x_username, user_id, address, evm_address, evm_secret_ciphertext, evm_signing_backend")
    .not("evm_address", "is", null)
    .limit(500);
  for (const w of (wallets ?? []) as EvmWalletRow[]) {
    if (!sweepAllowed(setting, w.x_username)) continue;
    await scanWallet(w);
  }
}

export interface ManualBridgeLine { chain: SweepChain; token: "ETH" | "USDC"; amount: string; status: string; txHash: string | null; error: string | null }

/** Checks every chain for one wallet and sweeps what is eligible. Returns what happened per chain. */
async function scanWallet(w: EvmWalletRow): Promise<ManualBridgeLine[]> {
  const db = await admin();
  const out: ManualBridgeLine[] = [];
  for (const chain of Object.keys(SWEEP_CHAINS) as SweepChain[]) {
    try {
      const pc = client(chain);
      const eth = await pc.getBalance({ address: w.evm_address as Hex });
      const usdcAddr = SWEEP_CHAINS[chain].usdc;
      let token: "ETH" | "USDC" | null = null;
      let amount = 0n;
      if (usdcAddr) {
        const usdc = await pc.readContract({ address: usdcAddr as Hex, abi: erc20Abi, functionName: "balanceOf", args: [w.evm_address as Hex] });
        const u = usdcSweepAmount(usdc, eth);
        if (u.amount > 0n) { token = "USDC"; amount = u.amount; }
      }
      if (!token) {
        const e = ethSweepAmount(eth);
        if (e > 0n) { token = "ETH"; amount = e; }
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
        amount: token === "ETH" ? (Number(amount) / 1e18).toFixed(6) : (Number(amount) / 1e6).toFixed(2),
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
    .select("x_username, user_id, address, evm_address, evm_secret_ciphertext, evm_signing_backend")
    .eq("user_id", userId).not("evm_address", "is", null).maybeSingle();
  if (!w) return { ok: false, message: "No OurBank EVM address yet. Open your OurBank card first.", lines: [] };
  if (!sweepAllowed(sweepSetting(), w.x_username)) return { ok: false, message: "Bridging is invite-only during testing.", lines: [] };
  await confirmSubmitted();
  const lines = await scanWallet(w as EvmWalletRow);
  if (!lines.length) return { ok: true, message: "Nothing to bridge yet. Need at least 0.0015 ETH or 2 USDC on Base, Arbitrum or Robinhood.", lines };
  return { ok: true, message: "Bridge started. SUI lands in ~20 min, then auto-buys $BLAST.", lines };
}
