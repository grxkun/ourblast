// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { actionCommand, decodeAction, detectToken, encodeAction } from "./chatTrade";

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
