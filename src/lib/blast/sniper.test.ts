// SPDX-License-Identifier: BUSL-1.1
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ pick: vi.fn(), simulation: vi.fn(), submit: vi.fn() }));
vi.mock("@/lib/terminal/bank-wallet.server", () => ({ findBankWallet: async () => ({ address: "0x1" }), bankSigner: mocks.submit }));
vi.mock("@/lib/terminal/bank-swap.server", () => ({ pickSwapRoute: mocks.pick }));
vi.mock("@/lib/terminal/sui-balances.server", () => ({ readCoinMetadata: async () => ({ symbol: "TEST", decimals: 6 }) }));
vi.mock("@mysten/sui/graphql", () => ({ SuiGraphQLClient: class { core = { simulateTransaction: mocks.simulation }; } }));
import { sniperPreflight } from "./sniper.server";
describe("unsigned sniper preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pick.mockResolvedValue({ ok: true, built: { tx: { setSender: vi.fn(), setGasBudget: vi.fn(), build: async () => new Uint8Array() }, venue: "Blast.fun" } });
  });
  it("blocks a failed simulation without signing", async () => {
    mocks.simulation.mockResolvedValue({ $kind: "Transaction", Transaction: { status: { success: false }, balanceChanges: [] } });
    expect((await sniperPreflight("tg-1", "0x3::coin::TEST", "1", "10")).ok).toBe(false);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("blocks missing received tokens even when execution status succeeds", async () => {
    mocks.simulation.mockResolvedValue({ $kind: "Transaction", Transaction: { status: { success: true }, balanceChanges: [] } });
    expect((await sniperPreflight("tg-1", "0x3::coin::TEST", "1", "10")).ok).toBe(false);
  });
  it("accepts only positive net output for the selected sender and token", async () => {
    mocks.simulation.mockResolvedValue({ $kind: "Transaction", Transaction: { status: { success: true }, balanceChanges: [{ address: "0x1", coinType: "0x3::coin::TEST", amount: "1000000" }] } });
    expect((await sniperPreflight("tg-1", "0x3::coin::TEST", "1", "10")).ok).toBe(true);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("blocks when no route exists", async () => {
    mocks.pick.mockResolvedValue({ ok: false, error: "No route" });
    expect((await sniperPreflight("tg-1", "0x3::coin::TEST", "1", "10")).ok).toBe(false);
    expect(mocks.simulation).not.toHaveBeenCalled();
  });
});