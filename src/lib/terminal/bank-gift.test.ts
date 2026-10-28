// SPDX-License-Identifier: BUSL-1.1
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleBankMention } from "./bank.server";

const m = vi.hoisted(() => ({
  resolve: vi.fn(), swap: vi.fn(), send: vi.fn(),
  wallet: vi.fn(),
  sender: `0x${"1".repeat(64)}`,
  recipient: `0x${"b".repeat(64)}`,
  holmot: "0x2de341b0ac3206a6a7befb5bf03e498b5aece8fd2e95e0cebe0c14d3af547f81::suipump::SUIPUMP",
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => {
    const chain = {
      select: () => chain, eq: () => chain, gt: () => chain,
      order: () => chain, limit: () => chain, insert: () => chain,
      update: () => chain, maybeSingle: async () => ({ data: null }),
      single: async () => ({ data: { id: "mock-swap" }, error: null }),
    };
    return chain;
  } },
}));
vi.mock("@/lib/tg/scanInfo.server", () => ({ resolveLaunchedTicker: m.resolve }));
vi.mock("./bank-wallet.server", () => ({ findBankWallet: m.wallet, sendFromBankWallet: m.send }));
vi.mock("./bank-swap.server", () => ({
  executeBankSwap: m.swap, SWAP_SUI: "0x2::sui::SUI", SWAP_GAS_BUDGET: 50_000_000n,
  swapAmountIn: () => 1_000_000_000n,
  formatUnits: (amount: bigint, decimals: number) => String(Number(amount) / 10 ** decimals),
}));
vi.mock("./sui-balances.server", () => ({
  readSuiHoldings: async () => [{ coinType: "0x2::sui::SUI", symbol: "SUI", decimals: 9, balance: 5_000_000_000n }],
  readCoinMetadata: async () => ({ symbol: "HOLMOT", decimals: 6 }),
}));
vi.mock("./sol-sweep.server", () => ({ resolveSolBridgeReply: async () => null }));
beforeEach(() => {
  vi.clearAllMocks();
  m.wallet.mockResolvedValue({ address: m.sender });
  m.resolve.mockResolvedValue(m.holmot);
  m.swap.mockResolvedValue({ ok: true, received: 115_508_250_100n, quoted: 115_500_000_000n, digest: "mock-buy", venue: "Suipump" });
  m.send.mockResolvedValue({ ok: true, digest: "mock-send" });
});
describe("shared verified HOLMOT gift execution (mocked, no funds moved)", () => {
  it("resolves HOLMOT and forwards the confirmed output to the resolved Telegram address", async () => {
    await handleBankMention("mock-gift", "sender", `Buy 1 sui of holmot to ${m.recipient}`);
    expect(m.resolve).toHaveBeenCalledWith("HOLMOT");
    expect(m.swap).toHaveBeenCalledWith({ address: m.sender }, "0x2::sui::SUI", m.holmot, 1_000_000_000n);
    expect(m.send).toHaveBeenCalledWith({ address: m.sender }, m.holmot, 115_508_250_100n, m.recipient);
  });
  it("refuses unresolved tickers before buying or sending", async () => {
    m.resolve.mockResolvedValue(null);
    await handleBankMention("mock-unknown", "sender", `Buy 1 sui of holmot to ${m.recipient}`);
    expect(m.swap).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
  });
});