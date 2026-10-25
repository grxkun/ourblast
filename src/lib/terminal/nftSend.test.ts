// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { parseNftSendCommand, pickNfts } from "./nftSend";

const nfts = [
  { id: "0x01", name: "HOLMOT #1", collection: "HOLMOT", type: "0xa::holmot::Nft" },
  { id: "0x02", name: "HOLMOT #2", collection: "HOLMOT", type: "0xa::holmot::Nft" },
  { id: "0x03", name: "Cat", collection: "Cats", type: "0xb::cat::Cat" },
];

describe("parseNftSendCommand", () => {
  it("reads a named NFT send to a SuiNS name", () => {
    expect(parseNftSendCommand("@ourblastbot send my holmot nft to adeniyi.sui")).toMatchObject({ target: "holmot", count: 1, recipientKind: "suins" });
  });
  it("reads an object id send", () => {
    expect(parseNftSendCommand("send nft 0xabc to @friend")).toMatchObject({ target: "0xabc", isObjectId: true, recipientKind: "x", recipient: "friend" });
  });
  it("reads counts and all", () => {
    expect(parseNftSendCommand("send 2 holmot nfts to @friend")?.count).toBe(2);
    expect(parseNftSendCommand("send all holmot nfts to @friend")?.count).toBe("all");
  });
  it("never matches coin sends", () => {
    expect(parseNftSendCommand("send 10 $BLAST to adeniyi.sui")).toBeNull();
  });
  it("refuses more than 20 at once", () => {
    expect(parseNftSendCommand("send 21 holmot nfts to @friend")).toBeNull();
  });
  it.each(["holmot #300", "holmot nft number 300", "holmot 300", "holmot no. 300", "holmot #300 nft"])("reads edition 300 from %s", (target) => {
    expect(parseNftSendCommand(`send ${target} to adeniyi.sui`)).toEqual({
      target: "holmot #300", isObjectId: false, count: 1, recipientKind: "suins", recipient: "adeniyi.sui",
    });
  });
  it("reads a numbered send to an external address", () => {
    const address = `0x${"a".repeat(64)}`;
    expect(parseNftSendCommand(`send holmot #300 to ${address}`)).toMatchObject({ recipientKind: "address", recipient: address });
  });
});

describe("pickNfts", () => {
  it("sends only the requested count", () => {
    expect(pickNfts(nfts, { target: "holmot", isObjectId: false, count: 1 }).map((n) => n.id)).toEqual(["0x01"]);
  });
  it("matches an exact object id", () => {
    expect(pickNfts(nfts, { target: "0x0003", isObjectId: true, count: 1 }).map((n) => n.id)).toEqual(["0x03"]);
  });
  const editions = [
    { id: "0x30", name: "Holmot #3000", collection: "HOLMOT", type: "0xa::collection::Holmot" },
    { id: "0x31", name: "Holmot #300", collection: "HOLMOT", type: "0xa::collection::Holmot" },
    { id: "0x32", name: "Cats #300", collection: "Cats", type: "0xb::cat::Cat" },
  ];
  it("selects only HOLMOT edition 300 through the complete command flow", () => {
    const cmd = parseNftSendCommand("send holmot nft number 300 to @friend");
    expect(cmd).not.toBeNull();
    if (!cmd) throw new Error("Numbered NFT command was not parsed");
    expect(pickNfts(editions, cmd).map((n) => n.id)).toEqual(["0x31"]);
  });
  it("does not substitute another edition when 300 is missing", () => {
    expect(pickNfts([editions[0]], { target: "holmot #300", isObjectId: false, count: 1 })).toEqual([]);
  });
  it("refuses ambiguous editions instead of choosing the first", () => {
    expect(pickNfts([...editions, { ...editions[1], id: "0x33" }], { target: "holmot #300", isObjectId: false, count: 1 })).toEqual([]);
  });
});
