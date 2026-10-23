// SPDX-License-Identifier: BUSL-1.1
import { afterEach, describe, expect, it, vi } from "vitest";
import { readSuiHoldings } from "./sui-balances.server";

afterEach(() => vi.unstubAllGlobals());
const page = (nodes: unknown[], hasNextPage = false, endCursor: string | null = null) =>
  Response.json({ data: { address: { balances: { nodes, pageInfo: { hasNextPage, endCursor } } } } });
const node = (type: string, totalBalance: string, symbol: string, decimals: number) =>
  ({ coinType: { repr: type }, totalBalance, coinMetadata: { symbol, decimals } });

describe("official Sui holdings", () => {
  it("reads SUI and USDC with correct decimals across pages and filters zero balances", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(page([node("0x2::sui::SUI", "170600000", "SUI", 9)], true, "next"))
      .mockResolvedValueOnce(page([node("0xabc::usdc::USDC", "7378000", "USDC", 6), node("0xabc::zero::ZERO", "0", "ZERO", 6)]));
    vi.stubGlobal("fetch", fetcher);
    const result = await readSuiHoldings("0x123");
    expect(result).toHaveLength(2);
    expect(result[0]?.balance).toBe(170600000n);
    expect(result[1]?.balance).toBe(7378000n);
    expect(result[1]?.decimals).toBe(6);
    expect(JSON.parse(fetcher.mock.calls[1]?.[1].body).variables.after).toBe("next");
  });
  it("rejects provider failure instead of returning an empty wallet", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("blocked", { status: 403 })));
    await expect(readSuiHoldings("0x123")).rejects.toThrow("temporarily unavailable");
  });
  it("rejects GraphQL errors even with partial data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ errors: [{ message: "unavailable" }] })));
    await expect(readSuiHoldings("0x123")).rejects.toThrow("temporarily unavailable");
  });
  it("accepts an explicitly empty successful balance page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(page([])));
    await expect(readSuiHoldings("0x123")).resolves.toEqual([]);
  });
});