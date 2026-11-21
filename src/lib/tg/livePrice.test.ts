// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it, vi } from "vitest";
const SUI = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";
const ct = "0x1::test::TEST";
const mocks = vi.hoisted(() => ({ curve: vi.fn(), prices: vi.fn() }));
vi.mock("./runCommand.server", () => ({ aftermathPrices: mocks.prices }));
vi.mock("./curvePrice.server", () => ({ readCurve: mocks.curve }));
vi.mock("@/lib/terminal/sui-balances.server", () => ({ readCoinMetadata: async () => ({ decimals: 9, symbol: "TEST" }) }));
import { livePrices } from "./livePrice.server";
describe("shared live curve feed", () => {
  it("prices a new curve token before a DEX quote exists", async () => {
    mocks.prices.mockResolvedValue({ [SUI]: 2 });
    mocks.curve.mockResolvedValue({ live: true, priceSui: 0.0001 });
    expect((await livePrices([ct]))[ct]).toBe(0.0002);
  });
  it("uses the live curve instead of a stale DEX quote", async () => {
    mocks.prices.mockResolvedValue({ [SUI]: 2, [ct]: 99 });
    mocks.curve.mockResolvedValue({ live: true, priceUsd: 0.01 });
    expect((await livePrices([ct]))[ct]).toBe(0.01);
  });
  it("never presents failed reads as a zero price", async () => {
    mocks.prices.mockResolvedValue({ [ct]: -1 });
    mocks.curve.mockResolvedValue(null);
    expect((await livePrices([ct]))[ct]).toBeUndefined();
  });
});