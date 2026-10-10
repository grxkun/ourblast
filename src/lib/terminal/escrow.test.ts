import { describe, expect, it } from "vitest";
import { escrowLegPayout, parseEscrowCancel, parseEscrowCommand } from "./escrow";

describe("escrow", () => {
  it("reads an escrow proposal", () => {
    expect(parseEscrowCommand("@Ourblastbot escrow with @Bob: 10 SUI for 50,000 $BLAST", "alice")).toEqual({
      counterparty: "bob", aAmount: "10", aToken: "SUI", bAmount: "50000", bToken: "BLAST",
    });
  });
  it("needs a counterparty other than the author", () => {
    expect(parseEscrowCommand("@Ourblastbot escrow 10 SUI for 5 USDC", "alice")).toBeNull();
    expect(parseEscrowCommand("@Ourblastbot escrow with @alice 10 SUI for 5 USDC", "alice")).toBeNull();
  });
  it("reads a cancel", () => {
    expect(parseEscrowCancel("@Ourblastbot cancel escrow #12")).toBe(12);
  });
  it("takes a 0.5% fee on each leg and refunds overpayment", () => {
    expect(escrowLegPayout(10_000_000_000n, 10_500_000_000n)).toEqual({
      toCounterparty: 9_950_000_000n, fee: 50_000_000n, refund: 500_000_000n,
    });
  });
});
