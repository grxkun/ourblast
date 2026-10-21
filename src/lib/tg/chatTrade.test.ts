// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { actionCoinType, actionCommand, decodeAction, detectToken, encodeAction } from "./chatTrade";

describe("tg chat trading", () => {
  it("detects a pasted coin type", () => {
    expect(detectToken("0x2a78::suipump::SUIPUMP")?.symbol).toBe("SUIPUMP");
  });
  it("detects a $ticker and ignores plain chat", () => {
    expect(detectToken("$blast")?.symbol).toBe("BLAST");
    expect(detectToken("hello there")).toBeNull();
  });
  it("round-trips a confirm payload under 64 bytes", () => {
    const enc = encodeAction({ kind: "go", side: "buy", amount: "10", symbol: "ABCDEFGHIJKLMNOP" });
    expect(enc.length).toBeLessThanOrEqual(64);
    expect(decodeAction(enc)).toEqual({ kind: "go", side: "buy", amount: "10", symbol: "ABCDEFGHIJKLMNOP" });
  });
  it("rejects selling more than 100%", () => {
    expect(decodeAction("g|s|150|BLAST")).toBeNull();
  });
  it("builds the bot command", () => {
    expect(actionCommand({ side: "sell", amount: "50", symbol: "BLAST" })).toBe("sell 50% $BLAST");
  });
});

const contract = "0x" + "a".repeat(64) + "::groklet::GROKLET";
describe("contract-backed Telegram buttons", () => {
  it("preserves a non-BLAST contract through ask and confirm while callbacks fit 64 bytes", () => {
    const ask = decodeAction(encodeAction({ kind: "ask", side: "buy", amount: "1", symbol: "GROKLET" }));
    if (!ask || ask.kind === "cancel") throw new Error("Invalid ask");
    const ca = actionCoinType(`$GROKLET\n${contract}\nPick an amount`, ask.symbol);
    const payload = encodeAction({ ...ask, kind: "go" });
    expect(new TextEncoder().encode(payload).length).toBeLessThanOrEqual(64);
    const go = decodeAction(payload);
    if (!go || go.kind === "cancel") throw new Error("Invalid confirm");
    const confirmedCA = actionCoinType(`Confirm buy\n${ca}`, go.symbol);
    expect(actionCommand(go, confirmedCA)).toBe(`buy 1 sui of ${contract}`);
  });
  it("never uses a contract belonging to a different symbol", () => {
    expect(actionCoinType(contract, "BLAST")).toBeNull();
  });
});
