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
  if (/^(?:burn|dead|zero|null|0x0+)$/i.test(target)) {
    recipientKind = "address";
    recipient = `0x${"0".repeat(64)}`;
  } else if (ADDRESS.test(target)) {
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

/** The dead address: tokens sent here can never move again. */
export const BURN_ADDRESS = `0x${"0".repeat(64)}`;
export function isBurnAddress(kind: BankRecipientKind, recipient: string): boolean {
  return kind === "address" && /^0x0{1,64}$/i.test(recipient);
}

export function describeRecipient(kind: BankRecipientKind, recipient: string): string {
  if (isBurnAddress(kind, recipient)) return "the burn address 🔥";
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

/** "buy 5 SUI of 0x…::x::X" / "sell 50% 0x…::x::X" — swaps inside the OurBank wallet. */
export interface SwapCommand {
  side: "buy" | "sell";
  /** buy: SUI to spend. sell: token amount, "all", or a percentage like "50%". */
  amount: string;
  token: string;
  isCoinType: boolean;
  /** "…and send it to @bob": forward what was bought/received afterwards.
   *  With amount+token ("…and send 1000 BLAST to adeniyi.sui"): forward that exact amount. */
  sendTo?: { recipientKind: BankRecipientKind; recipient: string; amount?: string; token?: string };
}

function parseTarget(targetRaw: string): { recipientKind: BankRecipientKind; recipient: string } | null {
  const target = targetRaw.replace(/[.,!?;:)"']+$/, "").replace(/^[("']/, "");
  if (/^(?:burn|dead|zero|null|0x0+)$/i.test(target)) return { recipientKind: "address", recipient: BURN_ADDRESS };
  if (ADDRESS.test(target)) return { recipientKind: "address", recipient: target.toLowerCase() };
  if (/\.sui$/i.test(target) && SUINS.test(target)) return { recipientKind: "suins", recipient: target.toLowerCase() };
  if (target.startsWith("@") && HANDLE.test(target) && !/^@ourblast(bot)?$/i.test(target)) return { recipientKind: "x", recipient: target.slice(1) };
  return null;
}
const THEN_SEND = /\b(?:and|then|,)\s+(?:then\s+)?(?:send|transfer|give|forward)\s+(?:it|them|all|everything|the\s+tokens?)?\s*to\s+(\S+)/i;
const THEN_SEND_AMOUNT = /\b(?:and|then|,)\s+(?:then\s+)?(?:send|transfer|give|forward)\s+([0-9]+(?:\.[0-9]+)?)\s+(\$?[A-Za-z][A-Za-z0-9_]{0,19}|0x[0-9a-fA-F]{1,64}::[A-Za-z0-9_]+::[A-Za-z0-9_]+)\s+to\s+(\S+)/i;

const TOKEN = String.raw`(0x[0-9a-fA-F]{1,64}::[A-Za-z0-9_]+::[A-Za-z0-9_]+|\$?[A-Za-z][A-Za-z0-9_]{0,19})`;
const NUM = String.raw`([0-9]+(?:\.[0-9]+)?)`;
const FILLER = String.raw`(?:(?:a|an|the|some)\s+)?(?:(?:token|coin)\s+)?`;
const BUY_A = new RegExp(String.raw`\bbuy\s+(?:me\s+)?${NUM}\s*\$?sui\s+(?:worth\s+)?(?:of\s+)?${FILLER}${TOKEN}`, "i");
// "with" typos (wirh, wth, wit, w/) are common on phones; "sui" is optional since SUI is the only buy currency.
const BUY_B = new RegExp(String.raw`\bbuy\s+(?:me\s+)?${FILLER}${TOKEN}(?:\s+or\s+[a-z0-9 ]{1,30}?)?\s+(?:with|wirh|wiht|wth|wit|w\/|for|using)\s+${NUM}(?:\s*\$?sui\b|(?![0-9.]))`, "i");
const SELL = new RegExp(String.raw`\bsell\s+(all|[0-9]+(?:\.[0-9]+)?%?)\s+(?:of\s+)?(?:my\s+)?${TOKEN}(?:\s+(?:for|into)\s+\$?sui)?\b`, "i");

function tokenOf(raw: string) {
  const isCoinType = COIN_TYPE.test(raw);
  return { token: isCoinType ? raw : raw.replace(/^\$/, "").toUpperCase(), isCoinType };
}

// "buy and burn 5 SUI of $X", "buy $X with 5 sui then burn it", "send it to the dead address".
const BURN_INTENT = /\b(?:burn(?:s|ed|ing|t)?|(?:dead|zero|null)\s*(?:address|wallet))\b/i;
const BURN_STRIP =
  /\s*(?:\b(?:and|then|&|\+)\b|,)?\s*(?:\bthen\b\s*)?(?:\b(?:send|transfer|forward|give)\b\s*)?(?:\b(?:it|them|all|everything|the\s+tokens?)\b\s*)?(?:\bto\b\s*(?:\bthe\b\s*)?)?\b(?:burn(?:s|ed|ing|t)?|(?:dead|zero|null)\s*(?:address|wallet))\b(?:\s*\b(?:address|wallet)\b)?/gi;

export function parseSwapCommand(raw: string): SwapCommand | null {
  const flatRaw = raw.replace(/\s+/g, " ");
  // Burn shorthand: strip the burn words, parse the trade, then aim it at the dead address.
  if (BURN_INTENT.test(flatRaw) && !/0x0{64}/i.test(flatRaw)) {
    const burnBase = parseSwapOnly(flatRaw.replace(BURN_STRIP, " "));
    if (burnBase?.side === "buy") {
      burnBase.sendTo = { recipientKind: "address", recipient: BURN_ADDRESS };
      return burnBase;
    }
  }
  const base = parseSwapOnly(raw);
  if (!base) return null;
  const flat = flatRaw;
  const thenAmount = THEN_SEND_AMOUNT.exec(flat);
  if (thenAmount) {
    const target = parseTarget(thenAmount[3]!);
    if (target && Number(thenAmount[1]) > 0) {
      const t = tokenOf(thenAmount[2]!);
      base.sendTo = { ...target, amount: thenAmount[1]!, token: t.isCoinType ? t.token : t.token };
    }
    return base;
  }
  const then = THEN_SEND.exec(flat);
  if (then) {
    const target = parseTarget(then[1]!);
    if (target) base.sendTo = target;
  }
  return base;
}

function parseSwapOnly(raw: string): SwapCommand | null {
  const text = raw
    .replace(/@ourblastbot\b/gi, " ")
    .replace(/\s+/g, " ")
    // "buy me blast 0x…::blast::BLAST" — drop a token name written before its address.
    .replace(/\b(?!(?:me|of|some|the|a|an|buy|sell|all|my)\b)\$?[A-Za-z][A-Za-z0-9_]{0,19}\s+(0x[0-9a-fA-F]{1,64}::[A-Za-z0-9_]+::[A-Za-z0-9_]+)/gi, "$1")
    // "on suipump" / "via bluefin": the route is picked automatically, so the venue is just noise.
    .replace(/\s+(?:on|via|from|at|through)\s+(?:suipump|blast\.?fun|bluefin|aftermath|cetus|perpsplexity|the\s+launchpad|launchpad|dex)\b/gi, "")
    .trim();
  let m = BUY_A.exec(text);
  if (m) return { side: "buy", amount: m[1]!, ...tokenOf(m[2]!) };
  m = BUY_B.exec(text);
  if (m) return { side: "buy", amount: m[2]!, ...tokenOf(m[1]!) };
  // "buy 0x…::lads::LADS 0.1 sui" — amount straight after the token.
  m = new RegExp(String.raw`\bbuy\s+(?:me\s+)?${FILLER}${TOKEN}\s+${NUM}\s*\$?sui\b`, "i").exec(text);
  if (m) return { side: "buy", amount: m[2]!, ...tokenOf(m[1]!) };
  m = SELL.exec(text);
  if (m) {
    const amount = m[1]!.toLowerCase();
    const t = tokenOf(m[2]!);
    if (!t.isCoinType && t.token === "SUI") return null;
    if (amount.endsWith("%") && !(Number(amount.slice(0, -1)) > 0 && Number(amount.slice(0, -1)) <= 100)) return null;
    if (amount !== "all" && !amount.endsWith("%") && !(Number(amount) > 0)) return null;
    return { side: "sell", amount, ...t };
  }
  return null;
}

/** A reply that picks option N ("2", "#2", "option 2") or pastes the start of a coin type. */
export function parseChoiceReply(raw: string, options: string[]): string | null {
  const text = raw.replace(/@[A-Za-z0-9_]+/g, " ").trim();
  const n = /^(?:#|option\s*|no\.?\s*)?([1-9])\b/i.exec(text);
  if (n) return options[Number(n[1]) - 1] ?? null;
  const hex = /0x[0-9a-f]{4,64}/i.exec(text)?.[0].toLowerCase();
  if (!hex) return null;
  const hits = options.filter((o) => o.toLowerCase().startsWith(hex) || o.toLowerCase().replace(/^0x0+/, "0x").startsWith(hex));
  return hits.length === 1 ? hits[0]! : null;
}

/** "0x1234…abcd::moo::MOO" — short enough for a tweet, unique enough to pick. */
export function shortCoinType(type: string): string {
  const [addr = "", ...rest] = type.split("::");
  return `${addr.slice(0, 6)}…${addr.slice(-4)}::${rest.join("::")}`;
}
