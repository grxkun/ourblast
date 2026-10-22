// SPDX-License-Identifier: BUSL-1.1
/**
 * Edge-safe Mayan Solana → Sui (MCTP auction) transaction builder.
 * Mirrors the SDK's createMctpFromSolanaInstructions (swap path, single tx,
 * no Jito) with hand-built v0 messages — no @solana/web3.js in the worker.
 * Fallback only: used when NEAR Intents can't quote SOL → SUI.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";

import { associatedTokenAddress, findPda, type GenericIx, SOL_USDC_MINT, SYSTEM_PROGRAM } from "./sol-sweep";

const PRICE_API = "https://price-api.mayan.finance/v3";
const SDK_VERSION = "15_2_2";
export const MCTP_PROGRAM = "dkpZqrxHFrhziEMQ931GLtfy11nFkCsfMftH9u6QwBU";
const CPI_PROXY = "D8C8iW6zmoKg5TRr8nQ7h14TMWqQX8FiBdj2ju5MF3wa";
const MAYAN_LOOKUP_TABLE = "Ff3yi1meWQQ19VPZMzGg6H8JQQeRudiV7QtVtyzJyoht";
const AGGREGATORS = new Set(["JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", "T1TANpTeScyeqVzzgNViGDNrkQ6qHz9KrSBS4aNXvGT", "DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH"]);
const WH_SUI = 21;
const MAX_TX_BYTES = 1232;

export interface MayanSolQuote {
  type: string;
  hasAuction: boolean;
  gasless?: boolean;
  relayer?: string;
  fromChain: string;
  toChain: string;
  fromToken: { contract: string };
  toToken: { contract: string; verifiedAddress?: string; decimals: number };
  effectiveAmountIn64: string;
  expectedAmountOut: number;
  minAmountOut: number;
  minMiddleAmount?: number;
  mctpInputContract: string;
  deadline64: string;
  gasDrop: number;
  redeemRelayerFee: number;
  solanaRelayerFee64: string;
  slippageBps: number;
  referrerBps?: number;
  maxSwapAccounts?: number;
  maxSwapDataLength?: number;
}

interface WireIx { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string }
interface SwapResponse { computeBudgetInstructions?: WireIx[]; setupInstructions?: WireIx[]; swapInstruction: WireIx; cleanupInstruction?: WireIx | null; addressLookupTableAddresses?: string[] }

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const json = (await res.json()) as T & { message?: string; msg?: string };
  if (!res.ok) throw new Error(`Mayan: ${json.message ?? json.msg ?? res.status}`);
  return json;
}

/** Live SOL → SUI quote; throws when Mayan has no usable single-tx route. */
export async function fetchMayanSolQuote(lamports: bigint): Promise<MayanSolQuote> {
  const q = new URLSearchParams({
    amountIn64: lamports.toString(), fromToken: "0x0000000000000000000000000000000000000000", fromChain: "solana",
    toToken: "0x2::sui::SUI", toChain: "sui", slippageBps: "300", swift: "false", mctp: "true", fastMctp: "false", sdkVersion: SDK_VERSION,
  });
  const json = await getJson<{ quotes?: MayanSolQuote[] }>(`${PRICE_API}/quote?${q}`);
  const quote = json.quotes?.find((x) => x.type === "MCTP" && x.hasAuction && !x.gasless);
  if (!quote) throw new Error("Mayan has no SOL → SUI route right now.");
  return quote;
}

const enc = new TextEncoder();
const dec = (s: string) => bs58.decode(s);
export const anchorIx = (name: string) => sha256(enc.encode(`global:${name}`)).subarray(0, 8);

function u64(n: bigint): Uint8Array {
  if (n < 0n || n >= 1n << 64n) throw new Error(`Invalid u64: ${n}`);
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}

/** SDK getAmountOfFractionalAmount: truncate to ≤8 decimals, then scale. */
export function fractional(amount: number, decimals: number): bigint {
  const cut = Math.min(8, decimals);
  const m = Number(amount).toFixed(cut + 1).match(new RegExp(`^-?\\d+(?:\\.\\d{0,${cut}})?`));
  if (!m) throw new Error("Bad amount");
  const [whole, frac = ""] = m[0].split(".");
  return BigInt(whole!) * 10n ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals) || "0");
}

function hex32(addr: string): Uint8Array {
  const h = addr.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{1,64}$/.test(h)) throw new Error(`Invalid Sui address: ${addr}`);
  return Uint8Array.from(Buffer.from(h.padStart(64, "0"), "hex"));
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const proxy = (ix: GenericIx): GenericIx => ({ programId: CPI_PROXY, keys: [{ pubkey: ix.programId, isSigner: false, isWritable: false }, ...ix.keys], data: ix.data });
const fromWire = (w: WireIx): GenericIx => ({ programId: w.programId, keys: w.accounts.map((a) => ({ ...a })), data: Uint8Array.from(Buffer.from(w.data, "base64")) });

/** init_order_ledger_gasless (mode 3 = swap). Account/data layout from the SDK. */
export function ledgerOrderIx(p: { user: string; ledger: string; randomKey: Uint8Array; suiDest: string; quote: MayanSolQuote; feeSolana: bigint }): GenericIx {
  const { quote } = p;
  if (!quote.toToken.verifiedAddress) throw new Error("Mayan quote is missing the SUI coin address.");
  if (!quote.minMiddleAmount) throw new Error("Mayan quote is missing minMiddleAmount.");
  const chain = new Uint8Array(2);
  new DataView(chain.buffer).setUint16(0, WH_SUI, true);
  const data = concat([
    anchorIx("init_order_ledger_gasless"),
    hex32(p.suiDest),
    u64(fractional(quote.minMiddleAmount, 6)),
    u64(fractional(quote.gasDrop, 8)),
    u64(fractional(quote.redeemRelayerFee, 6)),
    u64(p.feeSolana),
    chain,
    p.randomKey,
    Uint8Array.of(3),
    hex32(quote.toToken.verifiedAddress),
    u64(fractional(quote.minAmountOut, Math.min(8, quote.toToken.decimals))),
    u64(BigInt(quote.deadline64)),
    dec(SYSTEM_PROGRAM), // no referrer
    Uint8Array.of(quote.referrerBps ?? 0),
  ]);
  return {
    programId: MCTP_PROGRAM,
    keys: [
      { pubkey: p.user, isSigner: true, isWritable: true },
      { pubkey: p.ledger, isSigner: false, isWritable: true },
      { pubkey: associatedTokenAddress(p.ledger, quote.mctpInputContract), isSigner: false, isWritable: false },
      { pubkey: quote.mctpInputContract, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: p.user, isSigner: true, isWritable: true }, // relayer = the user (not gasless)
    ],
    data,
  };
}

function compactU16(n: number): number[] {
  const out: number[] = [];
  let v = n;
  for (;;) {
    let b = v & 0x7f;
    v >>= 7;
    if (v) b |= 0x80;
    out.push(b);
    if (!v) return out;
  }
}

export interface LookupTable { key: string; addresses: string[] }

/** Address lookup table account → addresses (56-byte header, then 32-byte keys). */
export function parseLookupTable(key: string, data: Uint8Array): LookupTable {
  const addresses: string[] = [];
  for (let o = 56; o + 32 <= data.length; o += 32) addresses.push(bs58.encode(data.subarray(o, o + 32)));
  return { key, addresses };
}

/** Compiles a v0 message (payer = sole signer), moving eligible accounts into lookup tables like web3.js MessageV0.compile. */
export function compileV0Message(payer: string, ixs: GenericIx[], blockhash: string, tables: LookupTable[]): Uint8Array {
  const meta = new Map<string, { s: boolean; w: boolean; prog: boolean }>([[payer, { s: true, w: true, prog: false }]]);
  const touch = (k: string, s: boolean, w: boolean, prog = false) => {
    const m = meta.get(k) ?? { s: false, w: false, prog: false };
    meta.set(k, { s: m.s || s, w: m.w || w, prog: m.prog || prog });
  };
  for (const ix of ixs) {
    for (const k of ix.keys) touch(k.pubkey, k.isSigner, k.isWritable);
    touch(ix.programId, false, false, true);
  }
  for (const [k, m] of meta) if (m.s && k !== payer) throw new Error("Mayan transaction needs a second signer.");

  const lookups: { key: string; w: number[]; r: number[]; wk: string[]; rk: string[] }[] = [];
  const taken = new Set<string>();
  for (const t of tables) {
    const l = { key: t.key, w: [] as number[], r: [] as number[], wk: [] as string[], rk: [] as string[] };
    for (const [k, m] of meta) {
      if (m.s || m.prog || taken.has(k)) continue;
      const i = t.addresses.indexOf(k);
      if (i < 0 || i > 255) continue;
      taken.add(k);
      if (m.w) { l.w.push(i); l.wk.push(k); } else { l.r.push(i); l.rk.push(k); }
    }
    if (l.w.length || l.r.length) lookups.push(l);
  }

  const stat = [...meta.entries()].filter(([k]) => !taken.has(k));
  const pick = (s: boolean, w: boolean) => stat.filter(([k, m]) => k !== payer && m.s === s && m.w === w).map(([k]) => k);
  const ro = pick(false, false);
  const keys = [payer, ...pick(false, true), ...ro];
  const all = [...keys, ...lookups.flatMap((l) => l.wk), ...lookups.flatMap((l) => l.rk)];
  if (all.length > 256) throw new Error("Too many accounts for one Solana transaction.");
  const idx = new Map(all.map((k, i) => [k, i]));

  const bytes: number[] = [0x80, 1, 0, ro.length, ...compactU16(keys.length)];
  for (const k of keys) bytes.push(...dec(k));
  bytes.push(...dec(blockhash), ...compactU16(ixs.length));
  for (const ix of ixs) {
    bytes.push(idx.get(ix.programId)!, ...compactU16(ix.keys.length), ...ix.keys.map((k) => idx.get(k.pubkey)!), ...compactU16(ix.data.length), ...ix.data);
  }
  bytes.push(...compactU16(lookups.length));
  for (const l of lookups) bytes.push(...dec(l.key), ...compactU16(l.w.length), ...l.w, ...compactU16(l.r.length), ...l.r);
  return Uint8Array.from(bytes);
}

export interface MayanSolPlan { ixs: GenericIx[]; tableKeys: string[]; ledger: string; quote: MayanSolQuote }

/** Quote → instructions for one SOL → SUI bridge from `user` to `suiDest`. Validates the swap pays the ledger. */
export async function planMayanSolBridge(user: string, suiDest: string, lamports: bigint): Promise<MayanSolPlan> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(suiDest)) throw new Error("Invalid Sui destination.");
  const quote = await fetchMayanSolQuote(lamports);
  if (quote.toChain !== "sui" || quote.fromChain !== "solana") throw new Error("Unexpected Mayan route.");
  if (quote.relayer && quote.relayer !== user) throw new Error("Mayan relayer route not supported.");
  if (quote.mctpInputContract !== SOL_USDC_MINT) throw new Error("Unexpected Mayan middle token.");
  if (BigInt(quote.effectiveAmountIn64) !== lamports) throw new Error("Mayan quoted a different amount.");
  if (!quote.minMiddleAmount || !Number(quote.deadline64)) throw new Error("Incomplete Mayan quote.");

  const randomKey = crypto.getRandomValues(new Uint8Array(32));
  const ledger = findPda([enc.encode("LEDGER_ORDER"), dec(user), randomKey], MCTP_PROGRAM);
  const ledgerUsdc = associatedTokenAddress(ledger, SOL_USDC_MINT);

  const sq = new URLSearchParams({
    minMiddleAmount: String(quote.minMiddleAmount), middleToken: quote.mctpInputContract, userWallet: user, userLedger: ledger,
    slippageBps: String(quote.slippageBps), fromToken: quote.fromToken.contract, amountIn64: quote.effectiveAmountIn64,
    depositMode: "SWAP", fillMaxAccounts: "false", chainName: "solana", sdkVersion: SDK_VERSION,
  });
  if (quote.maxSwapAccounts) sq.set("maxSwapAccounts", String(quote.maxSwapAccounts));
  if (quote.maxSwapDataLength) sq.set("maxSwapDataLength", String(quote.maxSwapDataLength));
  const swap = await getJson<SwapResponse>(`${PRICE_API}/get-swap/solana?${sq}`);

  const swapIx = fromWire(swap.swapInstruction);
  if (!AGGREGATORS.has(swapIx.programId)) throw new Error("Mayan returned an unknown swap program.");
  if (!swapIx.keys.some((k) => k.pubkey === ledgerUsdc && k.isWritable)) throw new Error("Mayan swap doesn't pay the bridge ledger — refusing.");
  const setup = (swap.setupInstructions ?? []).map(fromWire);
  for (const ix of [...setup, swapIx]) for (const k of ix.keys) if (k.isSigner && k.pubkey !== user) throw new Error("Mayan swap needs an unexpected signer.");

  const ixs: GenericIx[] = [
    ...(swap.computeBudgetInstructions ?? []).map(fromWire),
    ...setup.map(proxy),
    swapIx,
    ...(swap.cleanupInstruction ? [proxy(fromWire(swap.cleanupInstruction))] : []),
    proxy(ledgerOrderIx({ user, ledger, randomKey, suiDest, quote, feeSolana: BigInt(quote.solanaRelayerFee64) })),
  ];
  return { ixs, tableKeys: [MAYAN_LOOKUP_TABLE, ...(swap.addressLookupTableAddresses ?? [])], ledger, quote };
}

/** 1 signature + v0 message, base64; refuses oversize transactions. */
export function signedV0Base64(signature: Uint8Array, msg: Uint8Array): string {
  if (signature.length !== 64) throw new Error("Bad Solana signature length.");
  if (1 + 64 + msg.length > MAX_TX_BYTES) throw new Error("Mayan transaction is too large.");
  const out = new Uint8Array(1 + 64 + msg.length);
  out[0] = 1;
  out.set(signature, 1);
  out.set(msg, 65);
  return Buffer.from(out).toString("base64");
}
