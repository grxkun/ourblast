// SPDX-License-Identifier: BUSL-1.1
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  clients: [] as { url: string; network: string }[],
  signer: vi.fn(),
  submit: vi.fn(),
  curve: false,
  gasPayment: vi.fn(),
  gasBudget: vi.fn(),
  withGas: vi.fn(),
}));
vi.mock("@mysten/sui/graphql", () => ({
  SuiGraphQLClient: class {
    core = { simulateTransaction: async () => ({ $kind: "Transaction", Transaction: { balanceChanges: [{ address: "0x1", coinType: USDC, amount: "30000000" }] } }) };
    constructor(options: { url: string; network: string }) { mocks.clients.push(options); }
  },
}));
vi.mock("aftermath-ts-sdk", () => ({
  Aftermath: { create: async () => ({ Router: () => ({
    getCompleteTradeRouteGivenAmountIn: async (input: { coinInType: string; coinOutType: string; coinInAmount: bigint }) => ({
      coinIn: { type: input.coinInType, amount: input.coinInAmount },
      coinOut: { type: input.coinOutType, amount: 30_000_000n },
    }),
    getTransactionForCompleteTradeRoute: async () => ({
      setSender: vi.fn(), setGasPrice: vi.fn(), setGasBudget: mocks.gasBudget, setGasPayment: mocks.gasPayment, build: mocks.build,
    }),
  }) }) },
}));
vi.mock("./bank-wallet.server", () => ({ bankSigner: mocks.signer }));
vi.mock("./launchpad-buy.server", () => ({
  resolveLaunchpadBuy: async () => mocks.curve ? { pad: "blastv2" } : null,
  buildLaunchpadBuySwap: async () => ({
    tx: { setSender: vi.fn(), setGasPrice: vi.fn(), setGasBudget: mocks.gasBudget, setGasPayment: mocks.gasPayment, build: mocks.build },
    quoted: 30_000_000n, venue: "Blast.fun",
  }),
  buildLaunchpadSellSwap: async () => null,
}));
vi.mock("./suipump-launch.server", () => ({
  gasCoins: async () => [{ objectId: "0x1" }],
  hasGasFunds: async (_a: string, coins: unknown[]) => coins.length > 0,
  referenceGasPrice: async () => 1000,
  withGas: mocks.withGas, signAndExecute: mocks.submit,
}));

import { prepareSwapForAddress } from "./bank-swap.server";
const USDC = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

describe("unsigned swap preparation", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.clients.length = 0;
    mocks.curve = false;
    mocks.build.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });
  it("builds SUI to native USDC through official GraphQL without signing or submitting", async () => {
    const result = await prepareSwapForAddress("0x1", "0x2::sui::SUI", USDC, 1_000_000_000n);
    expect(result).toEqual({ ok: true, bytes: "AQID", quoted: 30_000_000n, venue: "Aftermath" });
    expect(mocks.clients).toEqual([{ url: "https://graphql.mainnet.sui.io/graphql", network: "mainnet" }]);
    expect(mocks.build).toHaveBeenCalledWith({ client: expect.any(Object) });
    expect(mocks.signer).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("returns a preparation failure without signing or submitting when resolution fails", async () => {
    mocks.build.mockRejectedValue(new Error("provider unavailable"));
    const result = await prepareSwapForAddress("0x1", "0x2::sui::SUI", USDC, 1_000_000_000n);
    expect(result).toEqual({ ok: false, error: "Could not prepare the swap: provider unavailable" });
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("prepares a 160 SUI curve buy without pinning discrete gas coins", async () => {
    mocks.curve = true;
    const result = await prepareSwapForAddress("0x1", "0x2::sui::SUI", USDC, 160_000_000_000n);
    expect(result).toEqual({ ok: true, bytes: "AQID", quoted: 30_000_000n, venue: "Blast.fun" });
    expect(mocks.gasBudget).toHaveBeenCalledWith(50_000_000n);
    expect(mocks.gasPayment).not.toHaveBeenCalled();
    expect(mocks.withGas).not.toHaveBeenCalled();
    expect(mocks.signer).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});