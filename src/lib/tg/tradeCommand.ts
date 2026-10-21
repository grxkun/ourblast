// SPDX-License-Identifier: BUSL-1.1
/** Turns the Telegram swap form into the same text command the bot parser runs. */
export function normalizeSwapToken(token: string): string {
  const t = token.trim();
  return /^0x[a-f0-9]{1,64}::[a-z_][a-z0-9_]*::[a-z_][a-z0-9_]*$/i.test(t)
    ? t : t.replace(/^\$/, "").toUpperCase();
}

export function swapTokenSymbol(token: string): string {
  return token.split("::").at(-1) ?? token;
}

function commandToken(token: string): string | null {
  const t = normalizeSwapToken(token);
  if (/^0x[a-f0-9]{1,64}::[a-z_][a-z0-9_]*::[a-z_][a-z0-9_]*$/i.test(t)) return t;
  return /^[A-Z0-9]{1,16}$/.test(t) ? `$${t}` : null;
}

export function buildTradeCommand(side: "buy" | "sell", token: string, amount: string): string | null {
  const t = commandToken(token);
  const a = amount.trim();
  if (!t) return null;
  if (side === "buy") return /^\d*\.?\d+$/.test(a) && Number(a) > 0 ? `buy ${a} sui of ${t}` : null;
  const pct = a.replace(/%$/, "");
  return /^\d*\.?\d+$/.test(pct) && Number(pct) > 0 && Number(pct) <= 100 ? `sell ${pct}% ${t}` : null;
}

/**
 * Slush-style "You pay X → You receive Y" swap. One side must be SUI (the bot
 * routes token↔SUI). `amount` is in units of the pay token, or "all" for MAX.
 */
export function buildSwapCommand(pay: string, receive: string, amount: string): string | null {
  const p = normalizeSwapToken(pay);
  const r = normalizeSwapToken(receive);
  const a = amount.trim().toLowerCase();
  const pt = commandToken(p), rt = commandToken(r);
  if (!pt || !rt || p === r) return null;
  const isAll = a === "all";
  if (!isAll && !(/^\d*\.?\d+$/.test(a) && Number(a) > 0)) return null;
  if (p === "SUI") return isAll ? null : `buy ${a} sui of ${rt}`;
  if (r === "SUI") return isAll ? `sell all ${pt}` : `sell ${a} ${pt} for SUI`;
  return null;
}

