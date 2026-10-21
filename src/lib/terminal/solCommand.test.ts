// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { parseSolCommand } from "./solCommand";

describe("parseSolCommand", () => {
  it("bridges an exact SOL amount", () => expect(parseSolCommand("bridge 0.03 SOL")).toEqual({ amountSol: 0.03 }));
  it("buys BLAST with an exact SOL amount", () => expect(parseSolCommand("buy BLAST with 0.03 sol")).toEqual({ amountSol: 0.03, buyBlast: true }));
  it("buy 0.05 sol of $blast", () => expect(parseSolCommand("buy 0.05 sol of $blast")).toEqual({ amountSol: 0.05, buyBlast: true }));
  it("bridge sol = everything", () => expect(parseSolCommand("bridge sol")).toEqual({}));
  it("SUI buys stay on Sui", () => expect(parseSolCommand("buy BLAST with 0.03 sui")).toBeNull());
  it("plain bridge is the EVM bridge", () => expect(parseSolCommand("bridge")).toBeNull());
  it("X tweet: buy 0.03 sol of blast on sui", () =>
    expect(parseSolCommand("@Ourblastbot buy 0.03 sol of blast on sui")).toEqual({ amountSol: 0.03, buyBlast: true }));
  it("X tweet: bridge 0.05 sol to sui", () => expect(parseSolCommand("@Ourblastbot bridge 0.05 sol to sui!")).toEqual({ amountSol: 0.05 }));
  it("X tweet: SUI buy stays on Sui", () => expect(parseSolCommand("@Ourblastbot buy 0.03 sui of blast on sui")).toBeNull());
});
