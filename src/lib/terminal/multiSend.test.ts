// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { parseBankCommand, parseMultiSendCommand } from "./bank";

describe("parseMultiSendCommand", () => {
  it("reads comma and & separated lists", () => {
    const c = parseMultiSendCommand("send 22 $HOLMOT, 10 $BLAST & 20 $ONE to adeniyi.sui");
    expect(c?.items).toEqual([
      { amount: "22", token: "HOLMOT", isCoinType: false },
      { amount: "10", token: "BLAST", isCoinType: false },
      { amount: "20", token: "ONE", isCoinType: false },
    ]);
    expect(c?.recipientKind).toBe("suins");
    expect(c?.recipient).toBe("adeniyi.sui");
  });
  it("reads 'and' and X handles", () => {
    const c = parseMultiSendCommand("@ourblastbot send 1.5 sui and 100 blast to @alice");
    expect(c?.items.map((i) => i.token)).toEqual(["SUI", "BLAST"]);
    expect(c?.recipient).toBe("alice");
  });
  it("ignores single-token sends", () => {
    expect(parseMultiSendCommand("send 10 $BLAST to adeniyi.sui")).toBeNull();
  });
  it("rejects duplicates and bad items", () => {
    expect(parseMultiSendCommand("send 1 blast, 2 blast to @alice")).toBeNull();
    expect(parseMultiSendCommand("send 1 blast, lots of sui to @alice")).toBeNull();
  });
  it("multi lists are not read as single sends", () => {
    expect(parseBankCommand("send 22 $HOLMOT, 10 $BLAST & 20 $ONE to adeniyi.sui")).toBeNull();
  });
});
