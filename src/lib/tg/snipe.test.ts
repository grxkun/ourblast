// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { actionCommand, decodeAction, encodeAction, parseSnipeCommand } from "./chatTrade";

const CA = "0x2a7803434c3e35a8d899340aa20cc9d5ddd2e5469a7d21b265ed00fd18bc04f9::suipump::SUIPUMP";

describe("snipe", () => {
  it("reads amount and slippage", () => {
    expect(parseSnipeCommand(`snipe ${CA} 5 sui slippage 12%`)).toEqual({ ok: true, coinType: CA, symbol: "SUIPUMP", amount: "5", slippage: "12" });
  });
  it("defaults slippage to 10%", () => {
    const r = parseSnipeCommand(`/snipe ${CA} 2`);
    expect(r?.ok && r.slippage).toBe("10");
  });
  it("refuses unknown tickers (main tokens resolve to verified contracts)", () => {
    expect(parseSnipeCommand("snipe $NOTAREALCOIN 5")?.ok).toBe(false);
  });
  it("refuses slippage above 50%", () => {
    expect(parseSnipeCommand(`snipe ${CA} 5 slippage 60%`)?.ok).toBe(false);
  });
  it("carries slippage through the confirm button into the command", () => {
    const data = encodeAction({ kind: "go", side: "buy", amount: "5", symbol: "SUIPUMP", slippage: "12" });
    expect(data.length).toBeLessThanOrEqual(64);
    const a = decodeAction(data);
    expect(a && a.kind === "go" && actionCommand(a, CA)).toBe(`buy 5 sui of ${CA} slippage 12%`);
  });
});
