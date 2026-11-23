// SPDX-License-Identifier: BUSL-1.1
import { describe, it, expect } from "vitest";
import { canonicalCoin, emptyMarketRow, FEATURED_BLAST_COINS, marketMatchesVenue, mergeMarket, marketNumber, sortMarket } from "./market";
import { eventCoin } from "./market-indexer.server";
import { indexerAuthorized } from "./indexer-auth.server";

describe("Sui ecosystem catalog", () => {
  const featured = () => FEATURED_BLAST_COINS.map((coin) => emptyMarketRow(coin, coin.split("::").at(-1) ?? "?", "Featured", coin.includes("577a8add") ? "Sui · Curated" : "Blast.fun", "2026-11-20T15:00:00Z"));
  it("includes exact community BLAST, BLASTY and JOEY in Main without featuring same-symbol copies", () => {
    const copy = emptyMarketRow("0x123::joey::JOEY", "JOEY", "Copy", "Blast.fun");
    expect(sortMarket([...featured(), copy], "main").map((r) => r.coinType)).toEqual([...FEATURED_BLAST_COINS]);
  });
  it("pins featured contracts in Blast.fun Trending ahead of other activity", () => {
    const busy = { ...emptyMarketRow("0x123::coin::COIN", "BUSY", "Busy", "Blast.fun"), txns24h: 1000 };
    expect(sortMarket([busy, ...featured()], "trending", "Blast.fun").slice(0, 3).map((r) => r.coinType)).toEqual([...FEATURED_BLAST_COINS]);
    expect(sortMarket([busy, ...featured()], "trending")[0]?.symbol).toBe("BUSY");
  });
  it("features the selected community BLAST in Blast Trending without changing its source or New venue", () => {
    const blast = emptyMarketRow("0x577a8addf60a34d4c705914ad066a3b28c3fc40d365ed0d9dfc408f29b4725d3::blast::BLAST", "BLAST", "BLAST", "Sui · Curated");
    expect(marketMatchesVenue(blast, "Blast.fun", "trending")).toBe(true);
    expect(marketMatchesVenue(blast, "Blast.fun", "new")).toBe(false);
    expect(blast.source).toBe("Sui · Curated");
    expect(sortMarket(featured(), "main").map((r) => r.coinType)).toContain(blast.coinType);
  });
  it("ranks real curve deposits over recency when DEX activity ties", () => {
    const old = { ...emptyMarketRow("0x1::a::A", "OLD", "Old", "Blast.fun", "2026-11-20T00:00:00Z"), curveReserveSui: 500 };
    const recent = { ...emptyMarketRow("0x2::b::B", "NEW", "New", "Blast.fun", "2026-11-23T00:00:00Z"), curveReserveSui: 0, fdvUsd: 1000000 };
    expect(sortMarket([recent, old], "trending").map((r) => r.symbol)).toEqual(["OLD", "NEW"]);
    expect(sortMarket([old, recent], "new", "Blast.fun").map((r) => r.symbol)).toEqual(["NEW", "OLD"]);
  });
  it("keeps Volume sorting independent of featured pins and curve reserves", () => {
    const volume = { ...emptyMarketRow("0x1::a::A", "A", "A", "Blast.fun"), volume24h: 10 };
    expect(sortMarket([...featured(), volume], "volume", "Blast.fun")[0]?.symbol).toBe("A");
  });
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