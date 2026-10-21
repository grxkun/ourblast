// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { buildTradeCommand } from "./tradeCommand";
describe("buildTradeCommand", () => {
  it("buy spends SUI", () => expect(buildTradeCommand("buy", "$blast", "1.5")).toBe("buy 1.5 sui of $BLAST"));
  it("sell uses percent", () => expect(buildTradeCommand("sell", "CZ", "100")).toBe("sell 100% $CZ"));
  it("rejects sell over 100%", () => expect(buildTradeCommand("sell", "CZ", "150")).toBeNull());
  it("rejects zero buy", () => expect(buildTradeCommand("buy", "CZ", "0")).toBeNull());
});

import { buildSwapCommand } from "./tradeCommand";
import { parseSwapCommand } from "@/lib/terminal/bank";
describe("buildSwapCommand", () => {
  it("SUI → token is a buy of that many SUI", () => expect(buildSwapCommand("SUI", "blast", "2.5")).toBe("buy 2.5 sui of $BLAST"));
  it("token → SUI sells that exact token amount", () => {
    const c = buildSwapCommand("$BLAST", "SUI", "1000")!;
    expect(c).toBe("sell 1000 $BLAST for SUI");
    expect(parseSwapCommand(c)).toMatchObject({ side: "sell", amount: "1000" });
  });
  it("MAX on a token sells all", () => expect(buildSwapCommand("BLAST", "SUI", "all")).toBe("sell all $BLAST"));
  it("rejects token→token, same token, zero, and MAX of SUI", () => {
    expect(buildSwapCommand("BLAST", "ONE", "1")).toBeNull();
    expect(buildSwapCommand("SUI", "SUI", "1")).toBeNull();
    expect(buildSwapCommand("SUI", "BLAST", "0")).toBeNull();
    expect(buildSwapCommand("SUI", "BLAST", "all")).toBeNull();
  });
});

describe("contract-backed Mini App swaps", () => {
  const ca = "0x" + "b".repeat(64) + "::groklet::GROKLET";
  it("preserves the selected non-BLAST contract and passes the buy safety parser", () => {
    const cmd = buildSwapCommand("SUI", ca, "1");
    expect(cmd).toBe(`buy 1 sui of ${ca}`);
    expect(parseSwapCommand(cmd ?? "")).toMatchObject({ side: "buy", token: ca, isCoinType: true });
  });
  it("preserves case-sensitive contract modules", () => {
    const mixed = "0x2a::MixedModule::MixedCoin";
    expect(buildTradeCommand("buy", mixed, "5")).toBe(`buy 5 sui of ${mixed}`);
  });
  it("sells the exact selected contract", () => {
    expect(buildSwapCommand(ca, "SUI", "all")).toBe(`sell all ${ca}`);
  });
});
