// SPDX-License-Identifier: BUSL-1.1
/** Pure helpers for Telegram copy trading: opt-in, per-trade size, daily cap, stop switch. */
import { validSlippage } from "./chatTrade";

export const COPY_MAX_PER_TRADE = 100;
export const COPY_MAX_DAILY = 1000;

export type CopyCommand =
  | { op: "start"; address: string; perTrade: string; dailyCap: string; slippage: string }
  | { op: "stop"; address: string | "all" }
  | { op: "error"; error: string };

const USAGE = "Usage: copy 0x… 2 sui max 10 sui slippage 10%";
const pad = (a: string) => `0x${a.slice(2).toLowerCase().padStart(64, "0")}`;

export function parseCopyCommand(text: string): CopyCommand | null {
  const t = text.trim().replace(/^\//, "");
  const stop = t.match(/^(?:stopcopy|stop\s+copy|uncopy)(?:@\w+)?\s+(all|0x[a-f0-9]{1,64})\s*$/i);
  if (stop) return { op: "stop", address: /^all$/i.test(stop[1]!) ? "all" : pad(stop[1]!) };
  if (!/^copy\b/i.test(t)) return null;
  const m = t.match(/^copy(?:@\w+)?\s+(0x[a-f0-9]{1,64})\s+(\d*\.?\d+)\s*(?:sui)?(?:\s+max\s+(\d*\.?\d+)\s*(?:sui)?(?:\s*\/\s*day)?)?(?:\s+slip(?:page)?\s+(\d*\.?\d+)\s*%?)?\s*$/i);
  if (!m) return { op: "error", error: USAGE };
  const perTrade = m[2]!;
  const dailyCap = m[3] ?? String(Math.min(Number(perTrade) * 5, COPY_MAX_DAILY));
  const slippage = m[4] ?? "10";
  if (!(Number(perTrade) > 0) || Number(perTrade) > COPY_MAX_PER_TRADE) return { op: "error", error: `Per-trade amount must be between 0 and ${COPY_MAX_PER_TRADE} SUI.` };
  if (Number(dailyCap) < Number(perTrade) || Number(dailyCap) > COPY_MAX_DAILY) return { op: "error", error: `Daily max must be at least the per-trade amount and at most ${COPY_MAX_DAILY} SUI.` };
  if (!validSlippage(Number(slippage))) return { op: "error", error: "Slippage must be between 0.1% and 50%." };
  return { op: "start", address: pad(m[1]!), perTrade, dailyCap, slippage };
}

/** Canonical command line embedded in the confirm card (callback_data can't hold an address). */
export function copyLine(c: { address: string; perTrade: string; dailyCap: string; slippage: string }): string {
  return `copy ${c.address} ${c.perTrade} sui max ${c.dailyCap} sui slippage ${c.slippage}%`;
}

/** How much a copied buy may spend now, given today's spend; 0 = skip. */
export function copyBudget(perTrade: number, dailyCap: number, spentDay: string | null, spent: number, today: string): number {
  const used = spentDay === today ? spent : 0;
  return used + perTrade <= dailyCap + 1e-9 ? perTrade : 0;
}

/** Leader's trade from its own balance changes, or null if it wasn't a buy/sell. */
export function leaderTrade(address: string, changes: { owner: string | null; coinType: string; amount: string }[]): { side: "buy" | "sell"; coinType: string } | null {
  const SUI = /^0x0*2::sui::SUI$/;
  const mine = changes.filter((c) => c.owner === address);
  const sui = mine.filter((c) => SUI.test(c.coinType)).reduce((s, c) => s + Number(c.amount), 0) / 1e9;
  const tokens = mine.filter((c) => !SUI.test(c.coinType));
  const gained = tokens.find((c) => BigInt(c.amount) > 0n);
  const lost = tokens.find((c) => BigInt(c.amount) < 0n);
  if (gained && sui < -0.01) return { side: "buy", coinType: gained.coinType };
  if (lost && sui > 0) return { side: "sell", coinType: lost.coinType };
  return null;
}
