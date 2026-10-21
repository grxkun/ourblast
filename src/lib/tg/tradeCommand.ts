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

/**
 * Slush-style "You pay X → You receive Y" swap. One side must be SUI (the bot
 * routes token↔SUI). `amount` is in units of the pay token, or "all" for MAX.
 */
export function buildSwapCommand(pay: string, receive: string, amount: string): string | null {
  const p = pay.trim().replace(/^\$/, "").toUpperCase();
  const r = receive.trim().replace(/^\$/, "").toUpperCase();
  const a = amount.trim().toLowerCase();
  if (!/^[A-Z0-9]{1,16}$/.test(p) || !/^[A-Z0-9]{1,16}$/.test(r) || p === r) return null;
  const isAll = a === "all";
  if (!isAll && !(/^\d*\.?\d+$/.test(a) && Number(a) > 0)) return null;
  if (p === "SUI") return isAll ? null : `buy ${a} sui of $${r}`;
  if (r === "SUI") return isAll ? `sell all $${p}` : `sell ${a} $${p} for SUI`;
  return null;
}

