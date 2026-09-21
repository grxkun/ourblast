import { describe, expect, it } from "vitest";

import { patchTemplateIdentifiers } from "./perpsplexity-launch.server";
import { describePerpsPosition, perpsQuoteUnits, perpsVirtualQuote, resolvePerpsMarket } from "./perpsplexity";

describe("resolvePerpsMarket", () => {
  it("accepts plain, cashtag and full-suffixed market names", () => {
    expect(resolvePerpsMarket("NVDA")?.symbol).toBe("NVDAUSD");
    expect(resolvePerpsMarket("$nvda")?.symbol).toBe("NVDAUSD");
    expect(resolvePerpsMarket("NVDAUSD")?.symbol).toBe("NVDAUSD");
  });

  it("returns null for markets the protocol does not list", () => {
    expect(resolvePerpsMarket("DOGEZZZ")).toBeNull();
  });
});

describe("perpsQuoteUnits", () => {
  it("converts USDC amounts to base units", () => {
    expect(perpsQuoteUnits(1)).toBe(1_000_000n);
    expect(perpsQuoteUnits(3.5)).toBe(3_500_000n);
  });
});

describe("perpsVirtualQuote", () => {
  it("is starting cap minus seed, zero when the seed covers the cap", () => {
    expect(perpsVirtualQuote(perpsQuoteUnits(4000), 1_000_000n)).toBe(perpsQuoteUnits(3999));
    expect(perpsVirtualQuote(1_000_000n, 1_000_000n)).toBe(0n);
  });

  it("rejects a seed below 1 USDC", () => {
    expect(() => perpsVirtualQuote(perpsQuoteUnits(4000), 999_999n)).toThrow();
  });
});

describe("describePerpsPosition", () => {
  it("renders the terminal card line", () => {
    expect(
      describePerpsPosition({ underlying: "NVDA", long: true, leverageBps: 50_000, startingCapUsd: 4000 }),
    ).toBe("⚡ NVDA LONG 5x · MC ~$4K");
  });
});

describe("patchTemplateIdentifiers", () => {
  it("rejects malformed module bytes instead of guessing", () => {
    expect(() => patchTemplateIdentifiers("AAAA", { module: "mycoin", struct: "MYCOIN" })).toThrow();
  });
});
