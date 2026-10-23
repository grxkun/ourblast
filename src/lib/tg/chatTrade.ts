// SPDX-License-Identifier: BUSL-1.1
/** Pure helpers for in-chat Telegram trading: token detection and button payloads (64-byte limit). */
import { mainToken } from "@/lib/terminal/mainTokens";

const COIN_TYPE = /^(0x[a-f0-9]{1,64})::([a-z_][a-z0-9_]*)::([a-z_][a-z0-9_]*)$/i;

/** Pasted contract (coin type) or $TICKER → ticker, or null if the message isn't a token. */
export function detectToken(text: string): { symbol: string; coinType: string | null } | null {
  const t = text.trim();
  const ct = t.match(COIN_TYPE);
  if (ct?.[3]) return { symbol: ct[3].toUpperCase().slice(0, 16), coinType: t };
  const tk = t.match(/^\$([a-z0-9]{1,16})$/i);
  if (tk?.[1]) return { symbol: tk[1].toUpperCase(), coinType: mainToken(tk[1])?.coinType ?? null };
  return null;
}

export type ChatAction = { kind: "ask" | "go"; side: "buy" | "sell"; amount: string; symbol: string; slippage?: string } | { kind: "cancel" };

export function encodeAction(a: ChatAction): string {
  if (a.kind === "cancel") return "x";
  return `${a.kind === "ask" ? "a" : "g"}|${a.side === "buy" ? "b" : "s"}|${a.amount}|${a.symbol}${a.slippage ? `|${a.slippage}` : ""}`;
}

export function decodeAction(data: string): ChatAction | null {
  if (data === "x") return { kind: "cancel" };
  const m = data.match(/^([ag])\|([bs])\|(\d*\.?\d+)\|([A-Z0-9_]{1,16})(?:\|(\d*\.?\d+))?$/);
  if (!m?.[3] || !m[4]) return null;
  const side = m[2] === "b" ? "buy" : "sell";
  const amount = m[3];
  if (Number(amount) <= 0 || (side === "sell" && Number(amount) > 100)) return null;
  const slippage = m[5];
  if (slippage !== undefined && !validSlippage(Number(slippage))) return null;
  return { kind: m[1] === "a" ? "ask" : "go", side, amount, symbol: m[4], ...(slippage ? { slippage } : {}) };
}

/** Same text the bot parser runs for the Mini App swap card. */
export function actionCoinType(text: string, symbol: string): string | null {
  for (const line of text.split("\n")) {
    const token = detectToken(line);
    if (token?.coinType && token.symbol === symbol) return token.coinType;
  }
  return null;
}

export function actionCommand(a: { side: "buy" | "sell"; amount: string; symbol: string; slippage?: string }, coinType?: string | null): string {
  const token = coinType && detectToken(coinType)?.coinType ? coinType : `$${a.symbol}`;
  const slip = a.slippage ? ` slippage ${a.slippage}%` : "";
  return (a.side === "buy" ? `buy ${a.amount} sui of ${token}` : `sell ${a.amount}% ${token}`) + slip;
}

export const MIN_SLIPPAGE = 0.1;
export const MAX_SLIPPAGE = 50;
export const DEFAULT_SNIPE_SLIPPAGE = "10";
export function validSlippage(n: number): boolean {
  return Number.isFinite(n) && n >= MIN_SLIPPAGE && n <= MAX_SLIPPAGE;
}

export type SnipeCommand = { ok: true; coinType: string; symbol: string; amount: string; slippage: string } | { ok: false; error: string };

/**
 * "snipe 0x…::mod::COIN 5 [sui] [slippage 10%]" → a confirm-first buy.
 * Contract only: tickers can be faked by fresh launches.
 */
export function parseSnipeCommand(text: string): SnipeCommand | null {
  const t = text.trim().replace(/^\/snipe(?:@\w+)?/i, "snipe");
  if (!/^snipe\b/i.test(t)) return null;
  const usage = "Usage: snipe 0x…::coin::COIN 5 sui slippage 10%";
  const m = t.match(/^snipe\s+(\S+)\s+(\d*\.?\d+)\s*(?:sui)?(?:\s+(?:max\s+)?slip(?:page)?\s+(\d*\.?\d+)\s*%?)?\s*$/i);
  if (!m?.[1] || !m[2]) return { ok: false, error: usage };
  const tok = detectToken(m[1]);
  if (!tok?.coinType) return { ok: false, error: `Snipes need the token's full contract address (tickers can be copied by fresh launches).\n${usage}` };
  const amount = m[2];
  if (!(Number(amount) > 0) || Number(amount) > 1000) return { ok: false, error: "Amount must be between 0 and 1000 SUI." };
  const slippage = m[3] ?? DEFAULT_SNIPE_SLIPPAGE;
  if (!validSlippage(Number(slippage))) return { ok: false, error: `Slippage must be between ${MIN_SLIPPAGE}% and ${MAX_SLIPPAGE}%.` };
  return { ok: true, coinType: tok.coinType, symbol: tok.symbol, amount, slippage };
}

export const BUY_PRESETS = ["1", "5", "10"];
export const SELL_PRESETS = ["25", "50", "100"];
