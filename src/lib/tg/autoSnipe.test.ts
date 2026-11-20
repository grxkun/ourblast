// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { autoBudget, autoLine, parseAutoSnipeCommand, ruleMatches } from "./autoSnipe";

const launch = { pad: "blast" as const, coinType: "0x1::pepe::PEPE", symbol: "PEPE", name: "Pepe", createdMs: 1_000_000 };

describe("auto-snipe filters", () => {
  it("parses all launchpads with amount, daily max and slippage", () => {
    expect(parseAutoSnipeCommand("autosnipe all 2 sui max 10 sui slippage 15%")).toEqual({ op: "start", pads: ["blast", "suipump"], amount: "2", dailyCap: "10", slippage: "15", keyword: null });
  });
  it("round-trips through the confirm line", () => {
    const r = parseAutoSnipeCommand("snipe filter suipump 1 sui keyword pepe");
    expect(r?.op === "start" && parseAutoSnipeCommand(autoLine(r))).toEqual(r);
  });
  it("caps per-launch spend at 50 SUI", () => {
    expect(parseAutoSnipeCommand("autosnipe all 51 sui")?.op).toBe("error");
  });
  it("refuses a daily max below the per-launch amount", () => {
    expect(parseAutoSnipeCommand("autosnipe all 5 sui max 2 sui")?.op).toBe("error");
  });
  it("skips launches older than 10 minutes", () => {
    const rule = { launchpads: ["blast"], keyword: null, active: true };
    expect(ruleMatches(rule, launch, launch.createdMs + 9 * 60_000)).toBe(true);
    expect(ruleMatches(rule, launch, launch.createdMs + 11 * 60_000)).toBe(false);
  });
  it("respects launchpad, keyword and pause", () => {
    expect(ruleMatches({ launchpads: ["suipump"], keyword: null, active: true }, launch, launch.createdMs)).toBe(false);
    expect(ruleMatches({ launchpads: ["blast"], keyword: "doge", active: true }, launch, launch.createdMs)).toBe(false);
    expect(ruleMatches({ launchpads: ["blast"], keyword: null, active: false }, launch, launch.createdMs)).toBe(false);
  });
  it("stops at the daily max and resets the next day", () => {
    expect(autoBudget(2, 10, "2026-11-20", 9, "2026-11-20")).toBe(0);
    expect(autoBudget(2, 10, "2026-11-19", 9, "2026-11-20")).toBe(2);
  });
});
