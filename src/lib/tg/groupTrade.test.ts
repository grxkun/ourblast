import { describe, expect, it } from "vitest";
import { parseGroupTrade } from "./groupTrade";

const CT = "0xabc::coin::COIN";
describe("group /buy and /burn", () => {
  it("buys with SUI", () => {
    expect(parseGroupTrade("/buy 2 sui $blast")).toBe("buy 2 sui of $BLAST");
    expect(parseGroupTrade(`@ourblastsuibot buy 0.5 sui of ${CT}`)).toBe(`buy 0.5 sui of ${CT}`);
  });
  it("burns held tokens to the burn address", () => {
    expect(parseGroupTrade("/burn 1000 $BLAST")).toBe("send 1000 $BLAST to burn");
  });
  it("buys and burns", () => {
    expect(parseGroupTrade("/burn 2 sui of $blast")).toBe("buy and burn 2 sui of $BLAST");
    expect(parseGroupTrade("@ourblastsuibot buy and burn 1 sui of $BLAST")).toBe("buy and burn 1 sui of $BLAST");
  });
  it("never burns SUI itself and ignores untagged chatter", () => {
    expect(parseGroupTrade("/burn 5 sui")).toBeNull();
    expect(parseGroupTrade("buy 2 sui $blast")).toBeNull();
  });
});

import { parseGroupBuyGift } from "./groupTrade";
describe("group buy & gift", () => {
  it("parses buy … to @user", () => {
    expect(parseGroupBuyGift("@ourblastsuibot Buy 1 sui of 0x2de3::suipump::SUIPUMP to @bigmodesty"))
      .toEqual({ amount: "1", token: "0x2de3::suipump::SUIPUMP", tgUsername: "bigmodesty" });
  });
  it("ignores plain buys", () => {
    expect(parseGroupBuyGift("/buy 1 sui $blast")).toBeNull();
  });
});
