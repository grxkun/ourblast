// SPDX-License-Identifier: BUSL-1.1
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalCoin } from "./market";
const mocks = vi.hoisted(() => ({ curve: vi.fn(), metadata: vi.fn() }));
vi.mock("./curvePrice.server", () => ({ readCurve: mocks.curve }));
vi.mock("@/lib/terminal/sui-balances.server", () => ({ readCoinMetadata: mocks.metadata }));
import { loadTokenDetail } from "./tokenDetail.server";

const type = (n: number) => `0x${n.toString(16)}::nihaosem::NIHAOSEM`;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.metadata.mockResolvedValue({ symbol: "NIHAOSEM", decimals: 9 });
  mocks.curve.mockResolvedValue(null);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    "0x2::sui::SUI": { price: 0.667 }, [type(1)]: { price: 999 },
  }))));
});
describe("exact-contract Mini App details", () => {
  it("uses active curve spot rather than an unrelated DEX quote and labels total supply as FDV", async () => {
    mocks.curve.mockResolvedValue({ factory: "Blast.fun v2", live: true, priceSui: 0.0000102, progress: 0.006, reserveSui: 48, targetSui: 8000, totalSupply: 1_000_000_000 });
    const data = await loadTokenDetail(type(1));
    expect(data.priceUsd).toBeCloseTo(0.0000102 * 0.667, 12);
    expect(data.fdvUsd).toBeCloseTo(6803.4, 5);
    expect(data.curve?.reserveSui).toBe(48);
    expect(data.source).toBe("Blast.fun v2");
  });
  it("keeps unavailable prices null, never substitutes the initial curve price", async () => {
    const data = await loadTokenDetail(type(2));
    expect(data.priceUsd).toBeNull();
    expect(data.fdvUsd).toBeNull();
  });
  it("keeps same-symbol contracts separate and coalesces same-contract requests", async () => {
    const [a, duplicate, b] = await Promise.all([loadTokenDetail(type(3)), loadTokenDetail(type(3)), loadTokenDetail(type(4))]);
    expect(a).toBe(duplicate);
    expect(a.coinType).toBe(canonicalCoin(type(3)));
    expect(b.coinType).toBe(canonicalCoin(type(4)));
    expect(mocks.curve).toHaveBeenCalledTimes(2);
  });
  it("rejects an object ID instead of treating it as a coin type", async () => {
    await expect(loadTokenDetail("0x123")).rejects.toThrow("Invalid token contract");
    expect(mocks.metadata).not.toHaveBeenCalled();
  });
});