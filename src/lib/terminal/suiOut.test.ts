import { describe, expect, it } from "vitest";

import { parseSuiOutCommand, suiOutProblem } from "./suiOut";

describe("SUI → SOL bridge", () => {
  it("parses own-wallet bridge", () => expect(parseSuiOutCommand("bridge 10 sui to sol")).toEqual({ amountSui: 10, target: "SOL" }));
  it("parses X phrasing with address", () =>
    expect(parseSuiOutCommand("@Ourblastbot bridge 10 sui to solana CeUa8AkoeoUZsLWabAio6F4LScxMrx1X5zUpSwrMbEWp!")).toEqual({ amountSui: 10, target: "SOL", destination: "CeUa8AkoeoUZsLWabAio6F4LScxMrx1X5zUpSwrMbEWp" }));
  it("flags EVM targets", () => expect(parseSuiOutCommand("bridge 10 sui to bnb")?.target).toBe("EVM"));
  it("rejects a bad Solana address", () => expect(parseSuiOutCommand("bridge 10 sui to sol 0xabc")).toBeNull());
  it("does not catch SOL→SUI", () => expect(parseSuiOutCommand("bridge 0.05 sol to sui")).toBeNull());
  it("minimum 5 SUI", () => expect(suiOutProblem(4.9, 100)).toMatch(/Minimum/));
  it("keeps 0.1 SUI for fees", () => {
    expect(suiOutProblem(10, 10.05)).toMatch(/Not enough/);
    expect(suiOutProblem(10, 10.1)).toBeNull();
  });
});
