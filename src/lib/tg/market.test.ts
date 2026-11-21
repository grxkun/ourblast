// SPDX-License-Identifier: BUSL-1.1
import { describe, it, expect } from "vitest";
import { canonicalCoin, emptyMarketRow, mergeMarket, marketNumber, sortMarket } from "./market";
import { eventCoin } from "./market-indexer.server";
import { indexerAuthorized } from "./indexer-auth.server";

describe("Sui ecosystem catalog", () => {
  it("deduplicates padded addresses but keeps same-ticker contracts separate", () => {
    const a = emptyMarketRow("0x1::coin::COIN", "NOVA", "Nova", "Popular");
    const b = emptyMarketRow("0x2::coin::COIN", "NOVA", "Nova", "Suipump");
    const rows = mergeMarket([a, b], [{ ...a, coinType: `0x${"1".padStart(64, "0")}::coin::COIN`, priceUsd: 2 }]);
    expect(rows).toHaveLength(2); expect(rows[0]?.source).toBe("Popular"); expect(rows[0]?.priceUsd).toBe(2);
  });
  it("preserves case-sensitive token types", () => { expect(canonicalCoin("0x1::LOFI::LOFI")).not.toBe(canonicalCoin("0x1::lofi::LOFI")); });
  it("chooses the deeper pool without presenting FDV as market cap", () => {
    const r = emptyMarketRow("0x1::a::A", "A", "A", "Cetus");
    const rows = mergeMarket([], [{ ...r, liquidityUsd: 10, priceUsd: 9 }, { ...r, liquidityUsd: 100, priceUsd: 2, fdvUsd: 1000 }]);
    expect(rows[0]?.priceUsd).toBe(2); expect(rows[0]?.mcapUsd).toBeNull(); expect(rows[0]?.fdvUsd).toBe(1000);
  });
  it("shows only actual timestamped launches in New, not old OG coins", () => {
    const rows = sortMarket([emptyMarketRow("0x1::a::A", "A", "A", "Sui · Curated"), emptyMarketRow("0x2::b::B", "B", "B", "Blast.fun", "2026-11-21T09:00:00Z")], "new");
    expect(rows.map((r) => r.symbol)).toEqual(["B"]);
  });
  it("distinguishes unavailable price from zero", () => { expect(marketNumber(null)).toBeNull(); expect(marketNumber("0")).toBe(0); });
  it("resolves Perpsplexity's unprefixed type without replacing the ticker with a struct tail", () => {
    expect(eventCoin({ timestamp: "2026-11-21", contents: { type: { repr: "event" }, json: { meme_type: "123::joey::JOEY" } } })).toBe(canonicalCoin("0x123::joey::JOEY"));
  });
  it("rejects arbitrary object IDs as tradable tokens", () => { expect(canonicalCoin("0x123")).toBeNull(); });
  it("denies ingestion without a configured matching secret", () => {
    expect(indexerAuthorized(null, [undefined])).toBe(false);
    expect(indexerAuthorized("wrong", ["configured"])).toBe(false);
    expect(indexerAuthorized("configured", ["configured"])).toBe(true);
  });
});