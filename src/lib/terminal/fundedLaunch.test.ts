// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { estimateSuiOut, FUND_MIN, isCancelLaunch, isConfirmLaunch, parseFundWith } from "./fundedLaunch";

describe("funded launch rules", () => {
  it("reads SOL, ETH and BNB amounts and strips the phrase", () => {
    expect(parseFundWith("launch $MOON on suipump with 0.1 sol")).toEqual({ fund: { asset: "SOL", amount: 0.1 }, rest: "launch $MOON on suipump" });
    expect(parseFundWith("deploy $DOG pay with .01 eth")?.fund).toEqual({ asset: "ETH", amount: 0.01 });
    expect(parseFundWith("launch $CAT using 0.05 BNB")?.fund).toEqual({ asset: "BNB", amount: 0.05 });
  });
  it("ignores SUI amounts and liquidity", () => {
    expect(parseFundWith("launch $MOON with 50 sui liquidity")).toBeNull();
  });
  it("minimums are 0.02 SOL, 0.0015 ETH, 0.01 BNB", () => {
    expect(FUND_MIN).toEqual({ SOL: 0.02, ETH: 0.0015, BNB: 0.01 });
  });
  it("estimates SUI with a 3% cushion", () => {
    expect(estimateSuiOut(1, 100, 1)).toBeCloseTo(97);
    expect(estimateSuiOut(1, 0, 1)).toBe(0);
  });
  it("confirm/cancel launch replies are distinct from bridge replies", () => {
    expect(isConfirmLaunch("@ourblastbot confirm launch")).toBe(true);
    expect(isConfirmLaunch("confirm bridge")).toBe(false);
    expect(isCancelLaunch("cancel launch!")).toBe(true);
  });
});
