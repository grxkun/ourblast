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

import { chartButtons, chartLinksHtml as chartLinksHtml2, launchpadLabel, scanCard } from "./scanner";
describe("scan card sources", () => {
  it("shows the launchpad when known", () => {
    expect(scanCard({ symbol: "Q", coinType: CT }, 1, "suipump")).toContain("Launched on Suipump");
    expect(launchpadLabel(null)).toBeNull();
  });
  it("includes Sui chart sites and no DexScreener", () => {
    const urls = chartButtons(CT).flat().map((b) => b.url).join(" ");
    for (const h of ["noodles.fi", "yolo.casa", "tavern.family"]) expect(urls).toContain(h);
    expect(urls).not.toContain("dexscreener");
    expect(chartLinksHtml2(CT)).toContain(">DS</a>");
    expect(chartLinksHtml2(CT)).toContain(">DEF</a>");
  });
});

import { richScanCard, fmtUsd } from "./scanner";
describe("rich scan card", () => {
  it("formats stats and never invents missing data", () => {
    const c = richScanCard({ symbol: "X", coinType: "0x1::x::X" }, { priceUsd: null, mcap: 5168, liquidity: 3551, volume24h: null, change24h: null, dex: "cetus", pools: 1 }, "dm");
    expect(c).toContain("Liq:</b> $3.6K [68.7%]");
    expect(c).toContain("USD:</b> n/a");
    expect(fmtUsd(2_500_000)).toBe("$2.50M");
  });
});

import { deckKeyboard, parseDeckTap, toggleSlot } from "./scanner";
describe("trading deck", () => {
  it("buttons carry slippage and fit 64 bytes", () => {
    const kb = deckKeyboard({ symbol: "QLONG", slots: [1, 2, 3], selected: [1], slip: "15", encode: (s, a, p) => `a|${s[0]}|${a}|QLONG|${p}` });
    expect(kb[0]![0]!.callback_data).toBe("a|b|1|QLONG|15");
    expect(kb[2]!.map((b) => b.callback_data)).toEqual(["cx|b|15", "cx|s|15", "pp"]);
    expect(kb[3]!.find((b) => b.text.startsWith("✅"))!.text).toBe("✅ Slip 15%");
    expect(kb[4]!.map((b) => b.text)).toEqual(["✅ W1", "W2", "W3"]);
    kb.flat().forEach((b) => expect((b.callback_data ?? "").length).toBeLessThanOrEqual(64));
  });
  it("parses taps and rejects unknown slippage", () => {
    expect(parseDeckTap("tw|2|10")).toEqual({ kind: "wallet", slot: 2, slip: "10" });
    expect(parseDeckTap("ts|99")).toBeNull();
  });
  it("never deselects the last wallet", () => {
    expect(toggleSlot([1], 1)).toEqual([1]);
    expect(toggleSlot([1], 3)).toEqual([1, 3]);
    expect(toggleSlot([1, 3], 1)).toEqual([3]);
  });
});

import { contractDeepLink, parseStartContract, chartLinksHtml } from "./scanner";
describe("group buy deep link", () => {
  it("round-trips a full contract within 64 chars", () => {
    const ct = "0x6055e3a3decac47b3934f1baf358fb799f1d6483b55d279dadad029286da583e::qlong::QLONG";
    const url = contractDeepLink(ct)!;
    expect(url.split("start=")[1]!.length).toBeLessThanOrEqual(64);
    expect(parseStartContract(`/start ${url.split("start=")[1]}`)).toBe(ct);
  });
  it("chart links are hyperlinked tags", () => {
    expect(chartLinksHtml("0x1::x::X")).toContain(">NOO</a>");
  });
});

import { padFromModule } from "./scanner";
describe("suipump template tokens", () => {
  const HOLMOT = "0x2de341b0ac3206a6a7befb5bf03e498b5aece8fd2e95e0cebe0c14d3af547f81::suipump::SUIPUMP";
  it("detects Suipump from the template module", () => expect(padFromModule(HOLMOT)).toBe("suipump"));
  it("shows the real ticker, not the template struct", () => {
    const card = richScanCard({ symbol: "SUIPUMP", coinType: HOLMOT }, { priceUsd: null, mcap: null, liquidity: null, volume24h: null, change24h: null, dex: null, pools: 0, symbol: "HOLMOT", name: "Holmot" }, "group");
    expect(card).toContain("$HOLMOT");
    expect(card).not.toContain("$SUIPUMP");
  });
});
