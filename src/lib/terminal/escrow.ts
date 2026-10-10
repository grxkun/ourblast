// SPDX-License-Identifier: BUSL-1.1
import { stripThousands } from "./bank";

/**
 * OTC escrow on X: "@Ourblastbot escrow with @bob: 10 SUI for 50000 $BLAST".
 * The proposer (A) gives the first leg, the counterparty (B) gives the second.
 */
export interface EscrowCommand {
  counterparty: string;
  aAmount: string;
  aToken: string;
  bAmount: string;
  bToken: string;
}

/** OurBlast's cut of each settled leg, in basis points (0.5%). */
export const ESCROW_FEE_BPS = 50n;
/** Unfunded escrows refund after this long. */
export const ESCROW_TTL_HOURS = 24;

const NUM = String.raw`([0-9]+(?:\.[0-9]+)?)`;
const TOKEN = String.raw`(0x[0-9a-fA-F]{1,64}::[A-Za-z0-9_]+::[A-Za-z0-9_]+|\$?[A-Za-z][A-Za-z0-9_]{0,19})`;
const LEGS = new RegExp(String.raw`${NUM}\s*${TOKEN}\s+(?:for|<->|<>|↔|in\s+exchange\s+for|against)\s+${NUM}\s*${TOKEN}`, "i");
const HANDLE = /@([A-Za-z0-9_]{1,15})\b/g;

const cleanToken = (t: string) => (t.includes("::") ? t : t.replace(/^\$/, "").toUpperCase());

export function parseEscrowCommand(text: string, author: string): EscrowCommand | null {
  if (!/\b(?:escrow|otc)\b/i.test(text)) return null;
  if (/\bcancel\b/i.test(text)) return null;
  const raw = stripThousands(text);
  const legs = raw.match(LEGS);
  if (!legs) return null;
  const me = author.replace(/^@/, "").toLowerCase();
  let counterparty: string | null = null;
  for (const m of raw.matchAll(HANDLE)) {
    const h = m[1]!.toLowerCase();
    if (h === "ourblastbot" || h === "ourblast" || h === me) continue;
    counterparty = h;
    break;
  }
  if (!counterparty) return null;
  const aToken = cleanToken(legs[2]!);
  const bToken = cleanToken(legs[4]!);
  if (aToken.toLowerCase() === bToken.toLowerCase()) return null;
  if (Number(legs[1]) <= 0 || Number(legs[3]) <= 0) return null;
  return { counterparty, aAmount: legs[1]!, aToken, bAmount: legs[3]!, bToken };
}

export function parseEscrowCancel(text: string): number | null {
  const m = text.match(/\bcancel\s+(?:the\s+|my\s+)?(?:escrow|otc)\s*#?\s*(\d{1,9})\b/i);
  return m ? Number(m[1]) : null;
}

/** Splits one deposited leg: the receiver's share, OurBlast's fee, and any overpayment back to the depositor. */
export function escrowLegPayout(required: bigint, held: bigint, feeBps: bigint = ESCROW_FEE_BPS) {
  if (held < required) throw new Error("Leg not fully funded.");
  const fee = (required * feeBps) / 10_000n;
  return { toCounterparty: required - fee, fee, refund: held - required };
}
