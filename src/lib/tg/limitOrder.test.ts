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
