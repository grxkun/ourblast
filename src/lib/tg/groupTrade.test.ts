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
