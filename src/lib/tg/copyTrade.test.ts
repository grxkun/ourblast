// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { copyBudget, copyLine, leaderTrade, parseCopyCommand } from "./copyTrade";

const A = "0x" + "c".repeat(64);
describe("copy trading", () => {
  it("reads per-trade, daily max and slippage", () => {
    expect(parseCopyCommand(`copy ${A} 2 sui max 10 sui slippage 12%`)).toEqual({ op: "start", address: A, perTrade: "2", dailyCap: "10", slippage: "12" });
  });
  it("round-trips the confirm line", () => {
    const c = parseCopyCommand(`copy ${A} 2 sui max 10 sui slippage 12%`);
    if (c?.op !== "start") throw new Error("bad");
    expect(parseCopyCommand(copyLine(c))).toEqual(c);
  });
  it("refuses more than 100 SUI per trade", () => {
    expect(parseCopyCommand(`copy ${A} 150`)?.op).toBe("error");
  });
  it("stop all", () => expect(parseCopyCommand("stopcopy all")).toEqual({ op: "stop", address: "all" }));
  it("daily cap blocks a trade that would exceed it and resets next day", () => {
    expect(copyBudget(2, 10, "2026-10-21", 9, "2026-10-21")).toBe(0);
    expect(copyBudget(2, 10, "2026-10-21", 8, "2026-10-21")).toBe(2);
    expect(copyBudget(2, 10, "2026-10-20", 10, "2026-10-21")).toBe(2);
  });
  it("detects leader buys only from its own SUI spend", () => {
    const ct = "0x1::x::X";
    expect(leaderTrade(A, [{ owner: A, coinType: "0x2::sui::SUI", amount: "-5000000000" }, { owner: A, coinType: ct, amount: "100" }])).toEqual({ side: "buy", coinType: ct });
    expect(leaderTrade(A, [{ owner: A, coinType: ct, amount: "100" }])).toBeNull();
  });
});
