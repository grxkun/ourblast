// SPDX-License-Identifier: BUSL-1.1
import { normalizeStructTag } from "@mysten/sui/utils";

export type MarketSort = "trending" | "new" | "volume" | "main";
export interface MarketRow {
  coinType: string; symbol: string; name: string; icon: string | null; dex: string;
  source: string; launchedAt: string | null; curated: boolean;
  priceUsd: number | null; change24h: number | null; mcapUsd: number | null;
  fdvUsd: number | null; volume24h: number | null; liquidityUsd: number | null; txns24h: number;
}
export function canonicalCoin(value: string): string | null {
  const type = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[\da-fA-F]{1,64}::[A-Za-z_][\w]*::[A-Za-z_][\w]*$/.test(type)) return null;
  try { return normalizeStructTag(type); } catch { return null; }
}
export const marketNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v); return Number.isFinite(n) ? n : null;
};
export function emptyMarketRow(coinType: string, symbol: string, name: string, source: string, launchedAt: string | null = null): MarketRow {
  return { coinType, symbol, name, source, launchedAt, curated: source === "Sui · Curated", icon: null,
    dex: source, priceUsd: null, change24h: null, mcapUsd: null, fdvUsd: null,
    volume24h: null, liquidityUsd: null, txns24h: 0 };
}
/** Identity is the full, case-sensitive Move type, never a ticker. */
export function mergeMarket(catalog: MarketRow[], pools: MarketRow[]): MarketRow[] {
  const rows = new Map<string, MarketRow>();
  for (const r of catalog) { const key = canonicalCoin(r.coinType); if (key) rows.set(key, { ...r, coinType: key }); }
  const best = new Map<string, MarketRow>();
  for (const r of pools) {
    const key = canonicalCoin(r.coinType); if (!key) continue;
    const prior = best.get(key);
    if (!prior || (r.liquidityUsd ?? 0) > (prior.liquidityUsd ?? 0)) best.set(key, { ...r, coinType: key });
  }
  for (const [key, r] of best) {
    const prior = rows.get(key);
    rows.set(key, { ...r, source: prior?.source ?? r.source, launchedAt: prior?.launchedAt ?? null, curated: prior?.curated ?? false });
  }
  return [...rows.values()];
}
export function sortMarket(rows: MarketRow[], sort: MarketSort): MarketRow[] {
  const selected = sort === "main" ? rows.filter((r) => r.curated) : sort === "new" ? rows.filter((r) => r.launchedAt) : rows;
  return [...selected].sort((a, b) => sort === "new"
    ? Date.parse(b.launchedAt ?? "") - Date.parse(a.launchedAt ?? "")
    : sort === "volume" ? (b.volume24h ?? 0) - (a.volume24h ?? 0)
    : b.txns24h - a.txns24h || (b.volume24h ?? 0) - (a.volume24h ?? 0));
}