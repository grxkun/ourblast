// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { decodePresaleAction, encodePresaleAction, parsePresaleCommand, parsePresaleType, presaleIdFromText, suiToMist } from "./presale";

const ID = "0x" + "ab".repeat(32);

describe("presale commands", () => {
  it("lists", () => expect(parsePresaleCommand("/presales")).toEqual({ kind: "list" }));
  it("views", () => expect(parsePresaleCommand(`presale ${ID}`)).toEqual({ kind: "view", id: ID }));
  it("commits", () => expect(parsePresaleCommand(`commit 5 sui to ${ID}`)).toEqual({ kind: "commit", id: ID, amount: "5" }));
  it("rejects over 1000 SUI", () => expect(parsePresaleCommand(`commit 1001 sui to ${ID}`)?.kind).toBe("error"));
  it("rejects tickers", () => expect(parsePresaleCommand("presale $BLAST")?.kind).toBe("error"));
  it("ignores unrelated text", () => expect(parsePresaleCommand("buy 1 sui of $BLAST")).toBeNull());
  it("round-trips callbacks within 64 bytes", () => {
    const d = encodePresaleAction("go", "5");
    expect(d.length).toBeLessThanOrEqual(64);
    expect(decodePresaleAction(d)).toEqual({ kind: "go", amount: "5" });
    expect(decodePresaleAction("pg|5000")).toBeNull();
  });
  it("reads id from bot text", () => expect(presaleIdFromText(`x\nPresale: ${ID}\n`)).toBe(ID));
  it("parses only blast_presale::Presale types", () => {
    expect(parsePresaleType("0x1::blast_presale::Presale<0x9::m::M, 0x2::sui::SUI>")).toEqual({ pkg: "0x1", memeType: "0x9::m::M", quoteType: "0x2::sui::SUI" });
    expect(parsePresaleType("0x1::fake::Presale<0x9::m::M, 0x2::sui::SUI>")).toBeNull();
  });
  it("converts SUI to MIST exactly", () => expect(suiToMist("1.5")).toBe(1_500_000_000n));
});
