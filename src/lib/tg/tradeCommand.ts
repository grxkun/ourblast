// SPDX-License-Identifier: BUSL-1.1
/** Turns the Telegram swap form into the same text command the bot parser runs. */
export function buildTradeCommand(side: "buy" | "sell", token: string, amount: string): string | null {
  const t = token.trim().replace(/^\$/, "").toUpperCase();
  const a = amount.trim();
  if (!/^[A-Z0-9]{1,16}$/.test(t)) return null;
  if (side === "buy") return /^\d*\.?\d+$/.test(a) && Number(a) > 0 ? `buy ${a} sui of $${t}` : null;
  const pct = a.replace(/%$/, "");
  return /^\d*\.?\d+$/.test(pct) && Number(pct) > 0 && Number(pct) <= 100 ? `sell ${pct}% $${t}` : null;
}

