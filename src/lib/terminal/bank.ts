/**
 * OurBank: "send 25 SUI to @alice" style commands arriving on X. Parsing only —
 * no network access, so it is safe in any bundle and easy to test.
 */
export type BankRecipientKind = "x" | "suins" | "address";

export interface BankCommand {
  amount: string;
  /** Upper-cased ticker, or a full coin type like 0x2::sui::SUI. */
  token: string;
  isCoinType: boolean;
  recipientKind: BankRecipientKind;
  /** Normalised: handle without "@", lower-cased name, or lower-cased 0x address. */
  recipient: string;
}

const COIN_TYPE = /^0x[0-9a-f]{1,64}::[a-z_][a-z0-9_]*::[A-Za-z_][A-Za-z0-9_]*$/i;
const ADDRESS = /^0x[0-9a-f]{64}$/i;
const SUINS = /^(?:@[a-z0-9-]+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.sui)$/i;
const HANDLE = /^@?[A-Za-z0-9_]{1,15}$/;

const COMMAND =
  /\b(?:send|tip|pay|transfer|give)\s+([0-9]+(?:\.[0-9]+)?)\s+(\$?[A-Za-z0-9_]{1,20}|0x[0-9a-fA-F]{1,64}::[A-Za-z0-9_]+::[A-Za-z0-9_]+)\s+to\s+(\S+)/i;

export function parseBankCommand(raw: string): BankCommand | null {
  // Drop mentions of the bot itself so "@ourblastbot send …" parses cleanly.
  const text = raw.replace(/@ourblastbot\b/gi, " ").replace(/\s+/g, " ").trim();
  const match = COMMAND.exec(text);
  if (!match) return null;
  const [, amount, tokenRaw, targetRaw] = match;
  if (!amount || !tokenRaw || !targetRaw) return null;
  if (!(Number(amount) > 0)) return null;

  const target = targetRaw.replace(/[.,!?;:)]+$/, "").replace(/^\(/, "");
  const isCoinType = COIN_TYPE.test(tokenRaw);
  const token = isCoinType ? tokenRaw : tokenRaw.replace(/^\$/, "").toUpperCase();

  let recipientKind: BankRecipientKind;
  let recipient: string;
  if (ADDRESS.test(target)) {
    recipientKind = "address";
    recipient = target.toLowerCase();
  } else if (/\.sui$/i.test(target) && SUINS.test(target)) {
    recipientKind = "suins";
    recipient = target.toLowerCase();
  } else if (target.startsWith("@") && HANDLE.test(target)) {
    recipientKind = "x";
    recipient = target.slice(1);
  } else {
    return null;
  }
  if (recipientKind === "x" && recipient.toLowerCase() === "ourblastbot") return null;

  return { amount, token, isCoinType, recipientKind, recipient };
}

/** "25.5" + 9 decimals → 25500000000n, exact (no floating point). */
export function toAtomic(amount: string, decimals: number): bigint {
  const [whole = "0", frac = ""] = amount.split(".");
  if (frac.length > decimals) throw new Error(`Too many decimal places (max ${decimals}).`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
}

export function describeRecipient(kind: BankRecipientKind, recipient: string): string {
  if (kind === "x") return `@${recipient}`;
  if (kind === "address") return `${recipient.slice(0, 6)}…${recipient.slice(-4)}`;
  return recipient;
}

export const BANK_STATUSES = [
  "PENDING_APPROVAL",
  "WAITING_RECIPIENT",
  "SUBMITTED",
  "CONFIRMED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type BankStatus = (typeof BANK_STATUSES)[number];
