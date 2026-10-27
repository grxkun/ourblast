import { describe, expect, it } from "vitest";
import { buyDeepLink, findScanTarget, parseStartBuy } from "./scanner";

const CT = "0x6055e3a3decac47b3934f1baf358fb799f1d6483b55d279dadad029286da583e::qlong::QLONG";

describe("group scanner", () => {
  it("detects a contract pasted inside a sentence", () => {
    expect(findScanTarget(`ape this ${CT} now`)).toEqual({ symbol: "QLONG", coinType: CT });
  });
  it("/scan with a contract", () => {
    expect(findScanTarget(`/scan@ourblastsuibot ${CT}`)?.coinType).toBe(CT);
  });
  it("ignores normal chat", () => {
    expect(findScanTarget("gm everyone")).toBeNull();
  });
  it("deep link round-trips the ticker", () => {
    expect(parseStartBuy(`/start ${buyDeepLink("QLONG").split("start=")[1]}`)).toBe("QLONG");
  });
});

import { chartButtons, launchpadLabel, scanCard } from "./scanner";
describe("scan card sources", () => {
  it("shows the launchpad when known", () => {
    expect(scanCard({ symbol: "Q", coinType: CT }, 1, "suipump")).toContain("Launched on Suipump");
    expect(launchpadLabel(null)).toBeNull();
  });
  it("includes Sui chart sites and keeps DexScreener", () => {
    const urls = chartButtons(CT).flat().map((b) => b.url).join(" ");
    for (const h of ["noodles.fi", "yolo.casa", "tavern.family", "dexscreener.com"]) expect(urls).toContain(h);
  });
});

import { richScanCard, fmtUsd } from "./scanner";
describe("rich scan card", () => {
  it("formats stats and never invents missing data", () => {
    const c = richScanCard({ symbol: "X", coinType: "0x1::x::X" }, { priceUsd: null, mcap: 5168, liquidity: 3551, volume24h: null, change24h: null, dex: "cetus", pools: 1 }, "dm");
    expect(c).toContain("Mcap: $5.2K · Liq: $3.6K | 68.7%");
    expect(c).toContain("Price: n/a");
    expect(fmtUsd(2_500_000)).toBe("$2.50M");
  });
});
