import { describe, expect, it } from "vitest";
import { parseBankCommand, toAtomic } from "./bank";

describe("parseBankCommand", () => {
  it("reads X handles", () => {
    expect(parseBankCommand("@ourblastbot send 25 SUI to @alice")).toMatchObject({
      amount: "25", token: "SUI", recipientKind: "x", recipient: "alice",
    });
  });
  it("reads SuiNS and cashtags", () => {
    expect(parseBankCommand("@ourblastbot tip 1000 $blast to Alice.sui!")).toMatchObject({
      token: "BLAST", recipientKind: "suins", recipient: "alice.sui",
    });
  });
  it("reads raw addresses and coin types", () => {
    const addr = "0x" + "a".repeat(64);
    const r = parseBankCommand(`send 1.5 0x2::sui::SUI to ${addr}`);
    expect(r).toMatchObject({ isCoinType: true, token: "0x2::sui::SUI", recipientKind: "address", recipient: addr });
  });
  it("rejects nonsense and the bot itself", () => {
    expect(parseBankCommand("launch $DOG Sui Dog")).toBeNull();
    expect(parseBankCommand("send 0 SUI to @bob")).toBeNull();
    expect(parseBankCommand("send 5 SUI to @ourblastbot")).toBeNull();
    expect(parseBankCommand("send 5 SUI to bob")).toBeNull();
  });
});

describe("toAtomic", () => {
  it("converts exactly", () => {
    expect(toAtomic("25.5", 9)).toBe(25_500_000_000n);
    expect(toAtomic("5", 6)).toBe(5_000_000n);
    expect(() => toAtomic("1.1234567", 6)).toThrow();
  });
});

import { parseChoiceReply, parseSwapCommand } from "./bank";
const CT = "0x" + "ab".repeat(32) + "::moo::MOO";
describe("parseSwapCommand", () => {
  it("reads buys by coin type", () => {
    expect(parseSwapCommand(`@ourblastbot buy 5 SUI of ${CT}`)).toMatchObject({ side: "buy", amount: "5", token: CT, isCoinType: true });
    expect(parseSwapCommand(`@ourblastbot buy ${CT} with 2.5 sui`)).toMatchObject({ side: "buy", amount: "2.5", isCoinType: true });
  });
  it("reads sells", () => {
    expect(parseSwapCommand("@ourblastbot sell 50% $moo")).toMatchObject({ side: "sell", amount: "50%", token: "MOO" });
    expect(parseSwapCommand(`sell all ${CT}`)).toMatchObject({ amount: "all", isCoinType: true });
    expect(parseSwapCommand("sell 120% $moo")).toBeNull();
    expect(parseSwapCommand("send 5 SUI to @bob")).toBeNull();
  });
  it("reads choice replies", () => {
    const opts = [CT, "0x" + "cd".repeat(32) + "::moo::MOO"];
    expect(parseChoiceReply("@ourblastbot 2", opts)).toBe(opts[1]);
    expect(parseChoiceReply("@ourblastbot 0xabab", opts)).toBe(CT);
    expect(parseChoiceReply("@ourblastbot hello", opts)).toBeNull();
  });
});
