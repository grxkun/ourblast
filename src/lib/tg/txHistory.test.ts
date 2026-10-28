import { describe, expect, it } from "vitest";
import { describeTx, formatTxList, isTxCommand, toDisplay } from "./txHistory";

describe("tx history", () => {
  it("recognises /tx commands", () => {
    expect(isTxCommand("/tx")).toBe(true);
    expect(isTxCommand("/transactions@ourblastsuibot")).toBe(true);
    expect(isTxCommand("/tx 5")).toBe(false);
  });
  it("converts atomic amounts with sign", () => {
    expect(toDisplay("-1500000000", 9)).toBe(-1.5);
    expect(toDisplay("30000000", 6)).toBe(30);
  });
  it("describes and links transactions", () => {
    const t = { digest: "Abc", wallet: "0x1", slot: 1, time: "2026-10-28T10:00:00Z", ok: true, outgoing: true, changes: [{ symbol: "SUI", amount: -1 }, { symbol: "BLAST", amount: 500 }] };
    expect(describeTx(t)).toBe("-1 SUI · +500 BLAST");
    expect(formatTxList([t])).toContain("https://suiscan.xyz/mainnet/tx/Abc");
  });
});
