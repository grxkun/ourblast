// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it, vi } from "vitest";
import { MarketCache, marketPool } from "./market-cache";

describe("market snapshot loading", () => {
  it("deduplicates cold requests and reuses a fresh snapshot", async () => {
    const cache = new MarketCache<string, number>(45_000, 300_000, () => 100);
    let finish: (value: number) => void = () => undefined;
    const load = vi.fn(() => new Promise<number>((resolve) => { finish = resolve; }));
    const first = cache.read("new", load);
    const second = cache.read("new", load);
    finish(7);
    expect((await first).value).toBe(7);
    expect((await second).value).toBe(7);
    expect((await cache.read("new", load)).refreshing).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("returns stale rows immediately while one retained refresh runs", async () => {
    let now = 100;
    const cache = new MarketCache<string, number>(45_000, 300_000, () => now);
    await cache.read("new", async () => 7);
    now = 46_000;
    let finish: (value: number) => void = () => undefined;
    const load = vi.fn(() => new Promise<number>((resolve) => { finish = resolve; }));
    const work: Promise<unknown>[] = [];
    const retain = (promise: Promise<unknown>) => { work.push(promise); };
    expect(await cache.read("new", load, retain)).toEqual({ value: 7, updatedAt: 100, refreshing: true });
    await cache.read("new", load, retain);
    expect(load).toHaveBeenCalledTimes(1);
    finish(8);
    await Promise.all(work);
    expect(await cache.read("new", load)).toEqual({ value: 8, updatedAt: 46_000, refreshing: false });
  });

  it("reuses the complete cached catalog for a different category", async () => {
    const cache = new MarketCache<string, number>(45_000, 300_000, () => 100);
    await cache.read("trending", async () => 7);
    const work: Promise<unknown>[] = [];
    const result = await cache.read("new", async () => 8, (promise) => { work.push(promise); });
    expect(result.value).toBe(7);
    expect(result.refreshing).toBe(true);
    await Promise.all(work);
    expect((await cache.read("new", async () => 9)).value).toBe(8);
  });

  it("blocks without runtime retention and never serves an expired snapshot", async () => {
    let now = 100;
    const cache = new MarketCache<string, number>(45_000, 300_000, () => now);
    await cache.read("new", async () => 7);
    now = 46_000;
    expect((await cache.read("new", async () => 8)).value).toBe(8);
    now = 400_000;
    const retain = vi.fn();
    expect((await cache.read("new", async () => 9, retain)).value).toBe(9);
    expect(retain).not.toHaveBeenCalled();
  });

  it("keeps the original timestamp on failure and permits retry", async () => {
    let now = 100;
    const cache = new MarketCache<string, number>(45_000, 300_000, () => now);
    await cache.read("new", async () => 7);
    now = 46_000;
    const work: Promise<unknown>[] = [];
    const result = await cache.read("new", async () => { throw new Error("offline"); }, (promise) => { work.push(promise); });
    expect(result.updatedAt).toBe(100);
    await Promise.all(work);
    expect((await cache.read("new", async () => 8)).value).toBe(8);
  });

  it("limits outbound enrichment concurrency and processes every token", async () => {
    let active = 0, peak = 0;
    const processed: number[] = [];
    await marketPool(Array.from({ length: 40 }, (_, i) => i), 3, async (item) => {
      peak = Math.max(peak, ++active);
      await Promise.resolve();
      processed.push(item);
      active--;
    });
    expect(peak).toBe(3);
    expect(new Set(processed).size).toBe(40);
  });
});