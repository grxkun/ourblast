// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { filterNfts, structName } from "./nft-browse";

const id = (c: string) => "0x" + c.repeat(64);
const nfts = [
  { id: id("a"), type: "0x1::collection::Holmot", name: "Holmot #127", collection: "Holmot", kiosk: { locked: true } },
  { id: id("b"), type: "0x2::blueyonsui::Nft", name: "Bluey Bubble Time#630", collection: "BlueyOnSui" },
  { id: id("c"), type: "0x1::collection::Holmot", name: "Holmot #1270", collection: "Holmot" },
];

describe("filterNfts", () => {
  it("matches an exact edition number, not a longer one", () => {
    expect(filterNfts(nfts, "#127", null, "all").map((n) => n.name)).toEqual(["Holmot #127"]);
  });
  it("matches unspaced editions", () => {
    expect(filterNfts(nfts, "630", null, "all")).toHaveLength(1);
  });
  it("filters by collection and storage", () => {
    expect(filterNfts(nfts, "", "0x1::collection::Holmot", "kiosk")).toHaveLength(1);
    expect(filterNfts(nfts, "", null, "loose")).toHaveLength(2);
  });
  it("matches object id prefix", () => {
    expect(filterNfts(nfts, "0xbbb", null, "all")[0].collection).toBe("BlueyOnSui");
  });
  it("reads struct names", () => expect(structName("0x1::collection::Holmot")).toBe("Holmot"));
});
