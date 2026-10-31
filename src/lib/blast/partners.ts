// SPDX-License-Identifier: BUSL-1.1
/**
 * Blast v2 partner codes (interest-protocol/blast-v2-contracts · sui/partners).
 * OURBLAST earns a share of Blast's own fee on flow it brings; users pay the same.
 * Pure helpers only — no signing here.
 */
import { Transaction } from "@mysten/sui/transactions";

export const BLAST_PARTNERS_PKG = "0x163a96aa9b88afe77e51febc195a9e0fa8534a6122bc09c6bd46d176c91a99f9";
export const PARTNER_TYPE = `${BLAST_PARTNERS_PKG}::blast_partners::Partner`;
export const PARTNER_CAP_TYPE = `${BLAST_PARTNERS_PKG}::blast_partners::PartnerCap`;
export const MAX_SHARE_BPS = 8_000;
export const PARTNER_DELAY_MS = 7 * 24 * 60 * 60 * 1_000;

export interface Timelocked<T> { before: T; after: T; at_ms: string | number; delay_ms?: string | number }

/** Value in force at `now`: `after` once now ≥ at_ms, else `before`. */
export function inForce<T>(t: Timelocked<T>, now: number): T {
  return now >= Number(t.at_ms) ? t.after : t.before;
}

/** A change is pending when at_ms is in the future and `after` differs from the value in force. */
export function pendingChange<T>(t: Timelocked<T>, now: number): T | null {
  return Number(t.at_ms) > now && t.after !== inForce(t, now) ? t.after : null;
}

/** floor(fee × share / 10,000) — Blast keeps the rounding dust. */
export function partnerCut(feeAtomic: bigint, shareBps: number): bigint {
  const s = BigInt(Math.max(0, Math.min(MAX_SHARE_BPS, Math.floor(shareBps))));
  return (feeAtomic * s) / 10_000n;
}

/** Unsigned PTB: mint an (inert) PartnerCap and send it to `owner`. */
export function buildMintPartnerCap(owner: string): Transaction {
  const tx = new Transaction();
  tx.setSender(owner);
  const [cap] = tx.moveCall({ target: `${BLAST_PARTNERS_PKG}::blast_partners::new_cap` });
  tx.transferObjects([cap!], tx.pure.address(owner));
  return tx;
}

/** Unsigned PTB: the live cap holder sets where the partner is paid (applies at once). */
export function buildSetRecipient(sender: string, partner: SharedObj, capId: string, recipient: string): Transaction {
  const tx = new Transaction();
  tx.setSender(sender);
  tx.moveCall({
    target: `${BLAST_PARTNERS_PKG}::blast_partners::set_recipient`,
    arguments: [tx.sharedObjectRef({ ...partner, mutable: true }), tx.object(capId), tx.pure.address(recipient), tx.object.clock()],
  });
  return tx;
}

export interface SharedObj { objectId: string; initialSharedVersion: string }
