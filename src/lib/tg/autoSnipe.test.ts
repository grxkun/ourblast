// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { autoBudget, autoLine, parseAutoSnipeCommand, ruleMatches, marketFilterMatches } from "./autoSnipe";

const launch = { pad: "blast" as const, coinType: "0x1::pepe::PEPE", symbol: "PEPE", name: "Pepe", createdMs: 1_000_000 };

describe("auto-snipe filters", () => {
  it("round trips USD market cap and real SUI reserve thresholds", () => {
    const r = parseAutoSnipeCommand("autosnipe blast 2 sui max 20 sui minmc 5k maxmc 20k minliq 500 sui");
    expect(r).toMatchObject({ op: "start", minMc: "5000", maxMc: "20000", minLiq: "500" });
    if (r?.op !== "start") throw new Error("Expected a valid rule");
    expect(parseAutoSnipeCommand(autoLine(r))).toEqual(r);
  });
  it("skips when MC exceeds $20,000 or is missing", () => {
    expect(marketFilterMatches({ max_mcap_usd: 20000 }, 20000, null)).toBe(true);
    expect(marketFilterMatches({ max_mcap_usd: 20000 }, 20001, null)).toBe(false);
    expect(marketFilterMatches({ max_mcap_usd: 20000 }, null, null)).toBe(false);
  });
  it("requires at least 500 SUI in real reserve", () => {
    expect(marketFilterMatches({ min_reserve_sui: 500 }, null, 500)).toBe(true);
    expect(marketFilterMatches({ min_reserve_sui: 500 }, null, 499)).toBe(false);
    expect(marketFilterMatches({ min_reserve_sui: 500 }, null, null)).toBe(false);
  });
  it("requires MC at least $5,000", () => {
    expect(marketFilterMatches({ min_mcap_usd: 5000 }, 4999, null)).toBe(false);
    expect(marketFilterMatches({ min_mcap_usd: 5000 }, 5000, null)).toBe(true);
  });
  it("rejects an inverted MC range", () => {
    expect(parseAutoSnipeCommand("autosnipe all 2 sui minmc 21k maxmc 20k")?.op).toBe("error");
  });
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

import { devMatches, packKeyword, unpackKeyword } from "./autoSnipe";
describe("dev-address snipe", () => {
  const dev = "0x" + "ab".repeat(32);
  it("parses dev and from", () => {
    const r = parseAutoSnipeCommand(`autosnipe all 2 sui dev ${dev} from w2,w3`);
    expect(r).toMatchObject({ op: "start", dev, slots: [2, 3] });
    if (r?.op === "start") expect(parseAutoSnipeCommand(autoLine(r))).toMatchObject({ dev, slots: [2, 3] });
  });
  it("rejects bad dev", () => expect(parseAutoSnipeCommand("autosnipe all 2 sui dev pepe")?.op).toBe("error"));
  it("round-trips keyword packing", () => expect(unpackKeyword(packKeyword("pepe", dev))).toEqual({ dev, keyword: "pepe" }));
  it("matches only that creator, fails closed", () => {
    expect(devMatches(dev, dev.toUpperCase().replace("0X", "0x"))).toBe(true);
    expect(devMatches(dev, "0x" + "cd".repeat(32))).toBe(false);
    expect(devMatches(dev, null)).toBe(false);
  });
});
