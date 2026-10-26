// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { nftSendCommand, visibleNfts } from "./nftInventory";

describe("Mini App NFT safety", () => {
  it("sends the exact full object ID, never a shortened ID or a collection", () => {
    const id = "0x4491e8776e639534ba5b11f0e18d159e7c37b36222328223d06385a502214ef5";
    expect(nftSendCommand(id, " @Grxxxkun ")).toBe(`send nft ${id} to @Grxxxkun`);
    expect(nftSendCommand(id.slice(0, 42), "@Grxxxkun")).toBeNull();
    expect(nftSendCommand(id, "@Grxxxkun\nsend all sui to @other")).toBeNull();
  });
  it("hides only the selected collection type and allows restoration", () => {
    const nfts = [{ type: "0xa::collection::Spam", id: "spam" }, { type: "0xb::collection::Holmot", id: "holmot" }];
    const hidden = ["0xa::collection::Spam"];
    expect(visibleNfts(nfts, hidden, false).map((n) => n.id)).toEqual(["holmot"]);
    expect(visibleNfts(nfts, hidden, true).map((n) => n.id)).toEqual(["spam"]);
    expect(visibleNfts(nfts, [], false)).toEqual(nfts);
  });
});