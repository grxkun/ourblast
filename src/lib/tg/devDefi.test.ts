import { describe, it, expect } from "vitest";
import { suilendNetUsd } from "./devDefi";
describe("suilendNetUsd", () => {
  it("nets deposits minus borrows across obligations", () => {
    const v = suilendNetUsd([
      { deposited_value_usd: { value: "20126747631868282128900" }, unweighted_borrowed_value_usd: { value: "5254791534880102248684" } },
      { deposited_value_usd: { value: "9029264833816735820500" }, unweighted_borrowed_value_usd: { value: "0" } },
    ]);
    expect(Math.round(v!)).toBe(23901);
  });
  it("returns null with no obligations", () => { expect(suilendNetUsd([])).toBeNull(); });
});
