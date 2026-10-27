import { describe, expect, it } from "vitest";
import { computePnl, unrealized, exitCard } from "./pnl";

const SUI = "0x2::sui::SUI", T = "0xabc::t::T";
const buy = (sui: number, tok: number) => ({ side: "buy", coin_in: SUI, coin_out: T, amount_in: String(sui * 1e9), quoted_out: String(tok * 1e6), status: "CONFIRMED" });
const sell = (tok: number, sui: number) => ({ side: "sell", coin_in: T, coin_out: SUI, amount_in: String(tok * 1e6), quoted_out: String(sui * 1e9), status: "CONFIRMED" });

describe("pnl", () => {
  it("averages cost across buys", () => {
    const p = computePnl([buy(1, 100), buy(3, 100)], T, 6);
    expect(p.avgCostSui).toBeCloseTo(0.02);
    expect(unrealized(p, 200, 0.03)!.pnlSui).toBeCloseTo(2);
  });
  it("realizes profit on sell at average cost", () => {
    const p = computePnl([buy(2, 100), sell(50, 3)], T, 6);
    expect(p.realizedSui).toBeCloseTo(2);
    expect(exitCard("T", p, null)).toContain("+200.0%");
  });
  it("ignores failed swaps", () => {
    expect(computePnl([{ ...buy(5, 10), status: "FAILED" }], T, 6).boughtTokens).toBe(0);
  });
});
