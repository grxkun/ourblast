// SPDX-License-Identifier: BUSL-1.1
export const SURGE_WINDOW_MS = 15 * 60_000;
export const TREND_WINDOW_MS = 4 * 60 * 60_000;
export const SURGE_PERCENT = 20;
export type Observation = { coin_type: string; observed_at: string; price_usd: number | null; price_basis: string; progress: number | null; reserve_sui: number | null; symbol: string };
export function priceChange(current: Observation, history: Observation[], windowMs: number): number | null {
  const now = Date.parse(current.observed_at), target = now - windowMs;
  const base = history.filter((h) => h.coin_type === current.coin_type && h.price_basis === current.price_basis && Math.abs(Date.parse(h.observed_at) - target) <= 120_000)
    .sort((a, b) => Math.abs(Date.parse(a.observed_at) - target) - Math.abs(Date.parse(b.observed_at) - target))[0];
  if (!base || base.price_usd == null || base.price_usd <= 0 || current.price_usd == null || current.price_usd <= 0) return null;
  return (current.price_usd / base.price_usd - 1) * 100;
}
export function crossedHalf(previous: number | null, current: number | null): boolean {
  return previous != null && current != null && previous >= 0 && previous < 0.5 && current >= 0.5 && current <= 1;
}
export function isSurging(change: number | null): boolean { return change != null && Number.isFinite(change) && change >= SURGE_PERCENT - 1e-9; }
export function confirmedBlastMigration(lifecycle: unknown): boolean { return lifecycle === "Migrated"; }
export function rankFourHourTrends(rows: Observation[], now: number) {
  const latest = new Map<string, Observation>();
  for (const row of rows) {
    const at = Date.parse(row.observed_at);
    if (at > now || now - at > 120_000) continue;
    if (at > Date.parse(latest.get(row.coin_type)?.observed_at ?? "1970-01-01")) latest.set(row.coin_type, row);
  }
  return [...latest.values()].map((row) => ({ row, change: priceChange(row, rows, TREND_WINDOW_MS) }))
    .filter((v): v is { row: Observation; change: number } => v.change != null && v.change > 0)
    .sort((a, b) => b.change - a.change).slice(0, 5);
}