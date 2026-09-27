import { describe, expect, it } from "vitest";

import {
  MAELSTROM_COIN_DECIMALS,
  MAELSTROM_COIN_SUPPLY,
  boundaryTickFor,
  buildLaunchMetadata,
  coinSortsAsA,
  feeRateOf,
  launchDeposit,
  maxTickFor,
  minimumSeed,
  previewLaunch,
  tickFromU32,
  tickToU32,
} from "./maelstrom";

const STROM = "0xac512319b5aeab0758ee8f6f30428467c3191c79abf04404bb7efe6e03520047::strom::STROM";
const SUI = "0x2::sui::SUI";

describe("maelstrom pool math", () => {
  it("sorts STROM as the pool's coin A against SUI, as its launch did", () => {
    expect(coinSortsAsA(STROM, SUI)).toBe(true);
  });

  it("matches the tick ranges real launches used", () => {
    // Launch #90 (SUI quote, spacing 220) locked tick_upper 443520.
    expect(maxTickFor(220)).toBe(443520);
    // Spacing 200 launches locked tick_upper 443600.
    expect(maxTickFor(200)).toBe(443600);
    // STROM's launch stored tick_lower as the u32 4294849816.
    expect(tickFromU32(4294849816)).toBe(-117480);
    expect(tickToU32(-117480)).toBe(4294849816);
  });

  it("uses the launchpad's two fee tiers only", () => {
    expect(feeRateOf(200)).toBe(10_000);
    expect(feeRateOf(220)).toBe(20_000);
    expect(() => feeRateOf(60)).toThrow();
  });

  it("prices an opening valuation and previews a seed that opens the pool", () => {
    const coinIsA = true;
    const tickSpacing = 220;
    const boundaryTick = boundaryTickFor({
      coinIsA,
      coinDecimals: MAELSTROM_COIN_DECIMALS,
      quoteDecimals: 9,
      supply: 1_000_000_000,
      startFdvInQuote: 4000 / 1.5,
      tickSpacing,
    });
    expect(Math.abs(boundaryTick % tickSpacing)).toBe(0);
    const base = {
      coinIsA,
      supply: MAELSTROM_COIN_SUPPLY,
      creatorBps: 0,
      tickSpacing,
      boundaryTick,
      feeRate: feeRateOf(tickSpacing),
      creatorFeeBps: 8000,
    };
    const seed = launchDeposit(minimumSeed(base));
    const preview = previewLaunch({ ...base, seed });
    expect(preview.tickLower).toBe(boundaryTick);
    expect(preview.tickUpper).toBe(maxTickFor(tickSpacing));
    expect(preview.boundaryTickU32).toBe(tickToU32(boundaryTick));
    expect(preview.premine).toBe(0n);
    expect(preview.float).toBe(MAELSTROM_COIN_SUPPLY);
    expect(preview.liquidity > 0n).toBe(true);
    expect(preview.quoteDeposited <= seed).toBe(true);
  });

  it("rejects a premine above the launchpad's limit", () => {
    expect(() =>
      previewLaunch({
        coinIsA: true,
        supply: MAELSTROM_COIN_SUPPLY,
        creatorBps: 2500,
        tickSpacing: 220,
        boundaryTick: -128480,
        feeRate: 20_000,
        creatorFeeBps: 8000,
        seed: 1_000_000n,
      }),
    ).toThrow(/premine/);
  });

  it("keeps only https links in the launch metadata", () => {
    expect(
      buildLaunchMetadata({ website: "https://ourblast.xyz", twitter: "http://x.com/a", telegram: "  " }),
    ).toBe(JSON.stringify({ website: "https://ourblast.xyz" }));
    expect(buildLaunchMetadata({})).toBe("");
  });
});
