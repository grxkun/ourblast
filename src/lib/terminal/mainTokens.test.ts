// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { parseSwapCommand } from "./bank";
import { mainToken } from "./mainTokens";
import { detectToken } from "@/lib/tg/chatTrade";

const TICKERS = ["USDC", "LOFI", "ZUK", "BLUB", "CETUS", "SEND", "BLUE", "WAL", "DEEP", "SOH"];

describe("main tokens", () => {
  it.each(TICKERS)("buy by ticker $%s resolves to its contract", (t) => {
    const c = parseSwapCommand(`buy 1 sui of $${t}`);
    expect(c?.isCoinType).toBe(true);
    expect(c?.token).toBe(mainToken(t)!.coinType);
  });
  it("SOH is Strait of Hormuz", () => {
    expect(mainToken("soh")!.coinType).toBe("0x62c9f760d935a44855424d11f8e979824070c751dd1966c4d1b9d2f8c479a35e::soh::SOH");
  });
  it("Telegram $WAL carries the contract", () => {
    expect(detectToken("$wal")?.coinType).toBe(mainToken("WAL")!.coinType);
  });
});
