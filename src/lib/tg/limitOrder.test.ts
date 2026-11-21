// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { limitLine, limitTradeCommand, limitTriggered, parseLimitCommand } from "./limitOrder";
import { parseWalletCommand, parseWalletPrefix, subHandle } from "./multiWallet";

const CT = "0xabc::blast::BLAST";
describe("limit orders", () => {
  it("parses a buy with default 5% slippage", () => {
    expect(parseLimitCommand(`limit buy 5 sui of ${CT} at 0.0012`)).toEqual({ op: "review", side: "buy", amount: "5", coinType: CT, triggerUsd: "0.0012", slippage: "5" });
  });
  it("parses a sell and round-trips to place", () => {
    const r = parseLimitCommand(`limit sell 50% ${CT} at $0.002 slippage 10%`);
    expect(r).toMatchObject({ op: "review", side: "sell", amount: "50", slippage: "10" });
    expect(parseLimitCommand(limitLine(r as never))).toMatchObject({ op: "place", side: "sell", triggerUsd: "0.002" });
  });
  it("refuses tickers and buys over 1000 SUI", () => {
    expect(parseLimitCommand("limit buy 5 sui of $BLAST at 1")).toMatchObject({ op: "error" });
    expect(parseLimitCommand(`limit buy 1001 sui of ${CT} at 1`)).toMatchObject({ op: "error" });
  });
  it("buys fire at or below, sells at or above", () => {
    expect(limitTriggered("buy", 1, 1)).toBe(true);
    expect(limitTriggered("buy", 1, 1.01)).toBe(false);
    expect(limitTriggered("sell", 2, 1.99)).toBe(false);
    expect(limitTriggered("sell", 2, 2)).toBe(true);
  });
  it("builds the fill command", () => {
    expect(limitTradeCommand({ side: "sell", amount: "50", coin_type: CT, slippage: 10 })).toBe(`sell 50% ${CT} slippage 10%`);
  });
  it("parses orders and cancel", () => {
    expect(parseLimitCommand("/orders")).toEqual({ op: "list" });
    expect(parseLimitCommand("cancel all")).toEqual({ op: "cancel", id: "all" });
    expect(parseLimitCommand("cancel 3fa2b1")).toEqual({ op: "cancel", id: "3fa2b1" });
  });
});

describe("multi-wallet", () => {
  it("parses use/new/list", () => {
    expect(parseWalletCommand("/wallets")).toEqual({ op: "list" });
    expect(parseWalletCommand("use 1, 3")).toEqual({ op: "use", slots: [1, 3] });
    expect(parseWalletCommand("use all")).toEqual({ op: "use", slots: "all" });
    expect(parseWalletCommand("use 7")).toMatchObject({ op: "error" });
    expect(parseWalletCommand("newwallet sniper")).toEqual({ op: "new", label: "sniper" });
  });
  it("only trades and sends can target one wallet", () => {
    expect(parseWalletPrefix(`w2 sell 50% ${CT}`)).toEqual({ slot: 2, rest: `sell 50% ${CT}` });
    expect(parseWalletPrefix("w2 bridge 1 sol to sui")).toBeNull();
  });
  it("extra wallet handles can never be a real X handle", () => {
    expect(subHandle(42, 2)).toBe("tg-42-w2");
    expect(/^[A-Za-z0-9_]{1,15}$/.test(subHandle(42, 2))).toBe(false);
  });
});

import { tpSlTargets } from "./limitOrder";
import { parseAutoSnipeCommand, autoLine } from "./autoSnipe";
describe("take-profit / stop-loss", () => {
  it("stop-loss fires at or below, never above", () => {
    expect(limitTriggered("sell", 1, 1, true)).toBe(true);
    expect(limitTriggered("sell", 1, 1.01, true)).toBe(false);
  });
  it("parses stoploss and round-trips", () => {
    const r = parseLimitCommand("stoploss 100% 0xabc::blast::BLAST at 0.0005");
    expect(r).toMatchObject({ op: "review", side: "sell", amount: "100", triggerUsd: "0.0005", stop: true });
    expect(parseLimitCommand(limitLine(r as never))).toMatchObject({ op: "place", stop: true });
  });
  it("TP +100% and SL -30% from entry 0.001", () => {
    expect(tpSlTargets(0.001, 100, 30)).toEqual({ tp: 0.002, sl: 0.0007 });
    expect(tpSlTargets(0.001, null, 100).sl).toBeNull();
  });
  it("auto-snipe rule keeps tp/sl through the confirm line", () => {
    const r = parseAutoSnipeCommand("autosnipe all 2 sui tp 100% sl 30%");
    expect(r).toMatchObject({ op: "start", amount: "2", tp: "100", sl: "30" });
    expect(parseAutoSnipeCommand(autoLine(r as never))).toMatchObject({ tp: "100", sl: "30" });
    expect(parseAutoSnipeCommand("autosnipe all 2 sui sl 100%")?.op).toBe("error");
  });
});

import { takeInitialPct, trailStep } from "./limitOrder";
import { snipeExitKeyboard } from "./autoSnipe";
describe("exit tools", () => {
  it("take initial sells exactly the cost share", () => {
    expect(takeInitialPct(2, 4)).toBe(50);
    expect(takeInitialPct(1, 3)).toBe(33.4);
    expect(takeInitialPct(2, 2)).toBeNull();
    expect(takeInitialPct(2, 1)).toBeNull();
  });
  it("trailing stop follows the peak", () => {
    expect(trailStep(1, 2, 15)).toEqual({ peak: 2, fire: false });
    expect(trailStep(2, 1.71, 15).fire).toBe(false);
    expect(trailStep(2, 1.7, 15).fire).toBe(true);
  });
  it("exit keyboard has 25/50/75/100 instant sells", () => {
    const kb = snipeExitKeyboard("0xabc::joey::JOEY");
    expect(kb[0]!.map((b) => b.callback_data)).toEqual(["g|s|25|JOEY", "g|s|50|JOEY", "g|s|75|JOEY", "g|s|100|JOEY"]);
  });
});
