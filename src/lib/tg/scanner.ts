// SPDX-License-Identifier: BUSL-1.1
/** Group token scanner: pure helpers (no wallet access — groups never touch anyone's funds). */
import { mainToken } from "@/lib/terminal/mainTokens";

const CT_ANY = /0x[a-f0-9]{1,64}::[a-z_][a-z0-9_]*::[a-z_][a-z0-9_]*/i;
export const BOT_USERNAME = "ourblastsuibot";

/** Finds a token in a group message: /scan <ca|$TICKER>, or a coin type pasted anywhere. */
export function findScanTarget(text: string): { symbol: string; coinType: string } | null {
  const t = text.trim();
  const scan = t.match(/^\/scan(?:@\w+)?\s+(\S+)/i);
  const raw = scan?.[1] ?? t.match(CT_ANY)?.[0] ?? null;
  if (!raw) return null;
  const ct = raw.match(CT_ANY)?.[0];
  if (ct) return { symbol: ct.split("::")[2]!.toUpperCase().slice(0, 16), coinType: ct };
  const tk = raw.replace(/^\$/, "");
  const m = /^[a-z0-9]{1,16}$/i.test(tk) ? mainToken(tk) : null;
  return m?.coinType ? { symbol: tk.toUpperCase(), coinType: m.coinType } : null;
}

/** DM deep link; Telegram start payloads max 64 chars of [A-Za-z0-9_-], so only tickers fit. */
export function buyDeepLink(symbol: string): string {
  const s = symbol.replace(/[^a-z0-9]/gi, "").slice(0, 16);
  return `https://t.me/${BOT_USERNAME}?start=b_${s}`;
}

export function parseStartBuy(text: string): string | null {
  return text.match(/^\/start\s+b_([a-z0-9]{1,16})$/i)?.[1]?.toUpperCase() ?? null;
}

export function fmtPrice(p: number | null): string {
  if (p == null || !Number.isFinite(p)) return "n/a";
  if (p >= 1) return `$${p.toFixed(4)}`;
  return `$${p.toPrecision(4)}`;
}

export function scanCard(t: { symbol: string; coinType: string }, price: number | null): string {
  return `🔎 $${t.symbol} — OURBLAST scan\nPrice: ${fmtPrice(price)} (Aftermath)\n\n${t.coinType}\n\nTap Buy to trade in a private chat — you always confirm first.`;
}
