// SPDX-License-Identifier: BUSL-1.1
/** Pure helpers for in-chat Telegram trading: token detection and button payloads (64-byte limit). */

const COIN_TYPE = /^(0x[a-f0-9]{1,64})::([a-z_][a-z0-9_]*)::([a-z_][a-z0-9_]*)$/i;

/** Pasted contract (coin type) or $TICKER → ticker, or null if the message isn't a token. */
export function detectToken(text: string): { symbol: string; coinType: string | null } | null {
  const t = text.trim();
  const ct = t.match(COIN_TYPE);
  if (ct?.[3]) return { symbol: ct[3].toUpperCase().slice(0, 16), coinType: t };
  const tk = t.match(/^\$([a-z0-9]{1,16})$/i);
  if (tk?.[1]) return { symbol: tk[1].toUpperCase(), coinType: null };
  return null;
}

export type ChatAction = { kind: "ask" | "go"; side: "buy" | "sell"; amount: string; symbol: string } | { kind: "cancel" };

export function encodeAction(a: ChatAction): string {
  if (a.kind === "cancel") return "x";
  return `${a.kind === "ask" ? "a" : "g"}|${a.side === "buy" ? "b" : "s"}|${a.amount}|${a.symbol}`;
}

export function decodeAction(data: string): ChatAction | null {
  if (data === "x") return { kind: "cancel" };
  const m = data.match(/^([ag])\|([bs])\|(\d*\.?\d+)\|([A-Z0-9_]{1,16})$/);
  if (!m?.[3] || !m[4]) return null;
  const side = m[2] === "b" ? "buy" : "sell";
  const amount = m[3];
  if (Number(amount) <= 0 || (side === "sell" && Number(amount) > 100)) return null;
  return { kind: m[1] === "a" ? "ask" : "go", side, amount, symbol: m[4] };
}

/** Same text the bot parser runs for the Mini App swap card. */
export function actionCoinType(text: string, symbol: string): string | null {
  for (const line of text.split("\n")) {
    const token = detectToken(line);
    if (token?.coinType && token.symbol === symbol) return token.coinType;
  }
  return null;
}

export function actionCommand(a: { side: "buy" | "sell"; amount: string; symbol: string }, coinType?: string | null): string {
  const token = coinType && detectToken(coinType)?.coinType ? coinType : `$${a.symbol}`;
  return a.side === "buy" ? `buy ${a.amount} sui of ${token}` : `sell ${a.amount}% ${token}`;
}

export const BUY_PRESETS = ["1", "5", "10"];
export const SELL_PRESETS = ["25", "50", "100"];
