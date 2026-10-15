import { describe, expect, it } from "vitest";

import { hopLeg2Lamports, parseSuiOutCommand, suiOutProblem } from "./suiOut";

describe("SUI outbound bridge", () => {
  it("parses own-wallet bridge", () => expect(parseSuiOutCommand("bridge 10 sui to sol")).toEqual({ amountSui: 10, target: "SOL" }));
  it("parses X phrasing with address", () =>
    expect(parseSuiOutCommand("@Ourblastbot bridge 10 sui to solana CeUa8AkoeoUZsLWabAio6F4LScxMrx1X5zUpSwrMbEWp!")).toEqual({ amountSui: 10, target: "SOL", destination: "CeUa8AkoeoUZsLWabAio6F4LScxMrx1X5zUpSwrMbEWp" }));
  it("bnb hops", () => expect(parseSuiOutCommand("bridge 10 sui to bnb")?.target).toBe("BNB"));
  it("eth defaults to Base", () => expect(parseSuiOutCommand("bridge 10 sui to eth")?.target).toBe("ETH_BASE"));
  it("eth on arbitrum", () => expect(parseSuiOutCommand("bridge 10 sui to eth on arbitrum")?.target).toBe("ETH_ARB"));
  it("eth on rh", () => expect(parseSuiOutCommand("bridge 10 sui to eth on rh")?.target).toBe("ETH_RH"));
  it("eth on robinhood chain with address", () =>
    expect(parseSuiOutCommand("bridge 10 sui to eth on robinhood chain 0xb80d720d94ba7365181023872202b9dee37893d5")).toEqual({ amountSui: 10, target: "ETH_RH", destination: "0xb80d720d94ba7365181023872202b9dee37893d5" }));
  it("evm address destination", () =>
    expect(parseSuiOutCommand("bridge 10 sui to bnb 0xb80d720d94ba7365181023872202b9dee37893d5")?.destination).toBe("0xb80d720d94ba7365181023872202b9dee37893d5"));
  it("rejects a Solana address for BNB", () => expect(parseSuiOutCommand("bridge 10 sui to bnb CeUa8AkoeoUZsLWabAio6F4LScxMrx1X5zUpSwrMbEWp")).toBeNull());
  it("rejects a bad Solana address", () => expect(parseSuiOutCommand("bridge 10 sui to sol 0xabc")).toBeNull());
  it("does not catch SOL→SUI", () => expect(parseSuiOutCommand("bridge 0.05 sol to sui")).toBeNull());
  it("minimum 5 SUI", () => expect(suiOutProblem(4.9, 100)).toMatch(/Minimum/));
  it("keeps 0.1 SUI for fees", () => {
    expect(suiOutProblem(10, 10.05)).toMatch(/Not enough/);
    expect(suiOutProblem(10, 10.1)).toBeNull();
  });
  it("leg 2 waits for 90% of quoted SOL", () => expect(hopLeg2Lamports(1_080_000_000n, 1_000_000_000n, 96_000_000n)).toBeNull());
  it("leg 2 sends arrived SOL minus 0.003, never the old balance", () =>
    expect(hopLeg2Lamports(1_096_000_000n, 1_000_000_000n, 96_000_000n)).toBe(93_000_000n));
  it("leg 2 caps at the quoted amount", () => expect(hopLeg2Lamports(2_000_000_000n, 1_000_000_000n, 96_000_000n)).toBe(93_000_000n));
});
