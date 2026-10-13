// SPDX-License-Identifier: BUSL-1.1
/**
 * Pure rules + edge-safe Solana transaction building for OurBank SOL deposits.
 * No @solana/web3.js (its websocket deps crash the Cloudflare worker).
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";

export const SOL_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SYSTEM_PROGRAM = "11111111111111111111111111111111";
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

export const SOL_FEE_LAMPORTS = 5_000n;
/** Rent for a new token account + fee, needed before a USDC sweep can run. */
export const USDC_SWEEP_SOL_NEEDED = 2_500_000n; // 0.0025 SOL
export const MIN_SOL_SWEEP = 20_000_000n; // 0.02 SOL
export const MIN_USDC_SWEEP = 2_000_000n; // 2 USDC

export type SolSweepPlan = { token: "USDC" | "SOL"; amount: bigint } | null;

/** USDC first (when SOL can pay its fees), else all SOL minus the fee (leaves 0 — no rent issue). */
export function planSolSweep(lamports: bigint, usdcAtomic: bigint): SolSweepPlan {
  if (usdcAtomic >= MIN_USDC_SWEEP && lamports >= USDC_SWEEP_SOL_NEEDED) return { token: "USDC", amount: usdcAtomic };
  if (lamports >= MIN_SOL_SWEEP) return { token: "SOL", amount: lamports - SOL_FEE_LAMPORTS };
  return null;
}

const dec = (s: string) => bs58.decode(s);

function isOnCurve(bytes: Uint8Array): boolean {
  try {
    ed25519.Point.fromBytes(bytes);
    return true;
  } catch {
    return false;
  }
}

/** findProgramAddress equivalent. */
export function findPda(seeds: Uint8Array[], programId: string): string {
  const pid = dec(programId);
  const marker = new TextEncoder().encode("ProgramDerivedAddress");
  for (let bump = 255; bump >= 0; bump--) {
    const parts = [...seeds, Uint8Array.of(bump), pid, marker];
    const buf = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { buf.set(p, o); o += p.length; }
    const h = sha256(buf);
    if (!isOnCurve(h)) return bs58.encode(h);
  }
  throw new Error("No PDA bump found.");
}

export function associatedTokenAddress(owner: string, mint: string): string {
  return findPda([dec(owner), dec(TOKEN_PROGRAM), dec(mint)], ATA_PROGRAM);
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

function u64le(n: bigint): number[] {
  const out: number[] = [];
  let v = n;
  for (let i = 0; i < 8; i++) { out.push(Number(v & 0xffn)); v >>= 8n; }
  return out;
}

interface Ix { program: number; accounts: number[]; data: number[] }

function message(header: [number, number, number], keys: string[], blockhash: string, ixs: Ix[]): Uint8Array {
  const bytes: number[] = [...header, ...compactU16(keys.length)];
  for (const k of keys) bytes.push(...dec(k));
  bytes.push(...dec(blockhash), ...compactU16(ixs.length));
  for (const ix of ixs) bytes.push(ix.program, ...compactU16(ix.accounts.length), ...ix.accounts, ...compactU16(ix.data.length), ...ix.data);
  return Uint8Array.from(bytes);
}

/** Legacy message: native SOL transfer. */
export function solTransferMessage(from: string, to: string, lamports: bigint, blockhash: string): Uint8Array {
  return message([1, 0, 1], [from, to, SYSTEM_PROGRAM], blockhash, [
    { program: 2, accounts: [0, 1], data: [2, 0, 0, 0, ...u64le(lamports)] },
  ]);
}

/** Legacy message: create recipient USDC account if missing, then transferChecked. */
export function usdcTransferMessage(owner: string, to: string, amount: bigint, blockhash: string): Uint8Array {
  const src = associatedTokenAddress(owner, SOL_USDC_MINT);
  const dst = associatedTokenAddress(to, SOL_USDC_MINT);
  // 0 owner(s,w) 1 src(w) 2 dst(w) 3 to 4 mint 5 system 6 token 7 ata
  const keys = [owner, src, dst, to, SOL_USDC_MINT, SYSTEM_PROGRAM, TOKEN_PROGRAM, ATA_PROGRAM];
  return message([1, 0, 5], keys, blockhash, [
    { program: 7, accounts: [0, 2, 3, 4, 5, 6], data: [1] },
    { program: 6, accounts: [1, 4, 2, 0], data: [12, ...u64le(amount), 6] },
  ]);
}

/** Wire format: 1 signature + message, base64. */
export function signedTxBase64(signature: Uint8Array, msg: Uint8Array): string {
  if (signature.length !== 64) throw new Error("Bad Solana signature length.");
  const out = new Uint8Array(1 + 64 + msg.length);
  out[0] = 1;
  out.set(signature, 1);
  out.set(msg, 65);
  return Buffer.from(out).toString("base64");
}
