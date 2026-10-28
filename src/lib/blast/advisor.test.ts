// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { curveModel, isAdvisorCommand, minimumSnipeOutput, presaleModel } from "./advisor";

describe("Blast planning and safety", () => {
  it("presale reconciles target, buyer entry and pool gap", () => {
    const p = presaleModel(100000, 400000000, 200000000, 60000);
    expect(p.salePrice).toBe(0.00025);
    expect(p.exactFillTokensPer100Sui).toBe(400000);
    expect(p.gap).toBeCloseTo(0.2);
    expect(p.quoteOutsidePool).toBe(40000);
  });
  it("virtual reserves do not become spendable graduation funds", () => {
    const p = curveModel(600000000, 1000, 3000, 200000000, 2400);
    expect(p.remaining).toBe(150000000);
    expect(p.quoteOutsidePool).toBe(600);
    expect(p.gap).toBeCloseTo(-0.55);
  });
  it("rejects overspending real funds", () => { expect(() => curveModel(600000000, 1000, 3000, 200000000, 3400)).toThrow(); });
  it("10% slippage protects 90% of net simulated output", () => { expect(minimumSnipeOutput(1000n, 10)).toBe(900n); });
  it("5% default also has minimum output protection", () => { expect(minimumSnipeOutput(1000n, 5)).toBe(950n); });
  it("fails closed on missing output", () => { expect(() => minimumSnipeOutput(0n, 10)).toThrow(); });
  it("recognizes advisory requests without interpreting buys", () => {
    expect(isAdvisorCommand("/advisor plan launch $BLAST")).toBe(true);
    expect(isAdvisorCommand("plan launch $BLAST")).toBe(true);
    expect(isAdvisorCommand("buy 1 sui of $BLAST")).toBe(false);
  });
});