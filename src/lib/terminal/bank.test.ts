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
