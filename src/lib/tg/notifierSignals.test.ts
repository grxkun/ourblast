// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { crossedHalf, confirmedBlastMigration, isSurging, priceChange, rankFourHourTrends, SURGE_WINDOW_MS, TREND_WINDOW_MS, type Observation } from "./notifierSignals";
const now = Date.parse("2026-11-24T08:00:00Z");
const row = (price: number | null, at = now, coin = "0x1::a::A"): Observation => ({ coin_type: coin, observed_at: new Date(at).toISOString(), price_usd: price, price_basis: "curve", progress: .4, reserve_sui: 10, symbol: "A" });
describe("channel signals", () => {
  it("alerts at +20% over 15 minutes, not a smaller rise", () => {
    expect(isSurging(priceChange(row(1.2), [row(1, now - 15 * 60_000)], SURGE_WINDOW_MS))).toBe(true);
    expect(isSurging(priceChange(row(1.19), [row(1, now - 15 * 60_000)], SURGE_WINDOW_MS))).toBe(false);
  });
  it("requires a real baseline near 15 minutes and the same pricing stage", () => {
    expect(priceChange(row(2), [row(1, now - 5 * 60_000)], SURGE_WINDOW_MS)).toBeNull();
    expect(priceChange(row(2), [{ ...row(1, now - SURGE_WINDOW_MS), price_basis: "dex" }], SURGE_WINDOW_MS)).toBeNull();
    expect(priceChange(row(null), [row(1, now - SURGE_WINDOW_MS)], SURGE_WINDOW_MS)).toBeNull();
  });
  it("fires 50% only on a crossing, not on baseline, repeat or downward movement", () => {
    expect(crossedHalf(.49, .5)).toBe(true);
    expect(crossedHalf(null, .6)).toBe(false);
    expect(crossedHalf(.5, .7)).toBe(false);
    expect(crossedHalf(.6, .49)).toBe(false);
  });
  it("migration-ready is not a completed migration", () => {
    expect(confirmedBlastMigration("MigrationReady")).toBe(false);
    expect(confirmedBlastMigration("Migrated")).toBe(true);
    expect(confirmedBlastMigration(undefined)).toBe(false);
  });
  it("ranks four-hour observed gain independently of launch recency", () => {
    const old = "0x1::old::OLD", newer = "0x2::new::NEW";
    const ranked = rankFourHourTrends([row(1, now - TREND_WINDOW_MS, old), row(3, now, old), row(1, now - TREND_WINDOW_MS, newer), row(1.3, now, newer)], now);
    expect(ranked.map((v) => v.row.coin_type)).toEqual([old, newer]);
    expect(ranked[0]?.change).toBe(200);
    expect(rankFourHourTrends([row(3)], now)).toHaveLength(0);
  });
});