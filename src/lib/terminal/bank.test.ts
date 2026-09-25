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
    expect(parseSwapCommand(`@Ourblastbot buy me ${CT} with 0.4 sui`)).toMatchObject({ side: "buy", amount: "0.4", token: CT, isCoinType: true });
  });
  it("reads sells", () => {
    expect(parseSwapCommand("@ourblastbot sell 50% $moo")).toMatchObject({ side: "sell", amount: "50%", token: "MOO" });
    expect(parseSwapCommand(`sell all ${CT}`)).toMatchObject({ amount: "all", isCoinType: true });
    expect(parseSwapCommand("@ourblastbot sell 25 MOO for SUI")).toMatchObject({ side: "sell", amount: "25", token: "MOO" });
    expect(parseSwapCommand(`sell 10 ${CT} into SUI`)).toMatchObject({ side: "sell", amount: "10", isCoinType: true });
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
describe("multi-step", () => {
  it("buy then send", () => {
    expect(parseSwapCommand(`@ourblast buy a token ${CT} with 1 sui and send it to @adeniyi`)).toMatchObject({
      side: "buy", amount: "1", token: CT, sendTo: { recipientKind: "x", recipient: "adeniyi" },
    });
    expect(parseSwapCommand("@ourblast buy a token Suicat or token address with 1 sui and send it to @adeniyi")).toMatchObject({
      token: "SUICAT", isCoinType: false, sendTo: { recipient: "adeniyi" },
    });
  });
  it("buy then send an exact amount to a SuiNS name", () => {
    expect(parseSwapCommand(`Buy 0.1 sui of ${CT} and send 1000 Blast to adeniyi.sui`)).toMatchObject({
      side: "buy", amount: "0.1", token: CT,
      sendTo: { recipientKind: "suins", recipient: "adeniyi.sui", amount: "1000", token: "BLAST" },
    });
    expect(parseSwapCommand(`buy 0.1 sui of ${CT} and send 1000 ${CT} to @adeniyi`)).toMatchObject({
      sendTo: { recipientKind: "x", recipient: "adeniyi", amount: "1000", token: CT },
    });
    // "send it" still means the whole received amount.
    const whole = parseSwapCommand(`buy 0.1 sui of ${CT} and send it to adeniyi.sui`);
    expect(whole).toMatchObject({ sendTo: { recipientKind: "suins", recipient: "adeniyi.sui" } });
    expect(whole?.sendTo?.amount).toBeUndefined();
  });
});
