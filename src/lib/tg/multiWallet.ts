// SPDX-License-Identifier: BUSL-1.1
/**
 * Pure helpers for multiple Sui trading wallets under one Telegram account.
 * Slot 1 is the main OurBank wallet (tied to X); slots 2–6 are extra Sui wallets the bot holds for this account.
 */
export const MAX_SLOT = 6;

export type WalletCommand =
  | { op: "list" }
  | { op: "new"; label: string | null }
  | { op: "use"; slots: number[] | "all" }
  | { op: "error"; error: string };

export function parseWalletCommand(text: string): WalletCommand | null {
  const t = text.trim().replace(/^\//, "");
  if (/^wallets(?:@\w+)?$/i.test(t)) return { op: "list" };
  const n = t.match(/^(?:newwallet|new\s+wallet|addwallet|add\s+wallet)(?:@\w+)?(?:\s+(.{1,20}))?$/i);
  if (n) return { op: "new", label: n[1]?.trim().replace(/[^\w .-]/g, "").slice(0, 20) || null };
  const u = t.match(/^use(?:\s+wallets?)?\s+(.+)$/i);
  if (!u) return null;
  if (/^all$/i.test(u[1]!.trim())) return { op: "use", slots: "all" };
  const parts = u[1]!.split(/[\s,&+]+|\band\b/i).map((s) => s.replace(/^w/i, "")).filter(Boolean);
  const slots = [...new Set(parts.map(Number))].sort((a, b) => a - b);
  if (!slots.length || slots.some((s) => !Number.isInteger(s) || s < 1 || s > MAX_SLOT)) return { op: "error", error: `Usage: use 1 · use 1,2 · use all (wallets 1–${MAX_SLOT}).` };
  return { op: "use", slots };
}

/** "w2 sell 50% $X" → run on wallet 2 only. Only Sui trades and sends may target a specific wallet. */
export function parseWalletPrefix(text: string): { slot: number; rest: string } | null {
  const m = text.trim().match(/^w([1-6])[:\s]+((?:buy|sell|swap|send)\b.+)$/i);
  return m ? { slot: Number(m[1]), rest: m[2]!.trim() } : null;
}

/** Trades that fan out across the selected wallets. */
export const isFanOutTrade = (text: string) => /^(buy|sell|swap)\b/i.test(text.trim());

/** Internal OurBank handle for an extra wallet. Contains "-", which X handles can't, so it never collides with a real account. */
export const subHandle = (tgUserId: number, slot: number) => `tg-${tgUserId}-w${slot}`;
