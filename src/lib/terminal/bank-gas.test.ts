// SPDX-License-Identifier: BUSL-1.1
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase58, normalizeSuiAddress } from "@mysten/sui/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withBankGas } from "./bank-gas";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), sign: vi.fn() }));
vi.mock("./suipump-launch.server", () => ({
  gasCoins: async () => [{ objectId: normalizeSuiAddress("0x18"), version: "1", digest: "11111111111111111111111111111111" }],
  hasGasFunds: async () => true,
  referenceGasPrice: async () => 1000,
  rpc: vi.fn(),
  signAndExecute: mocks.execute,
  sharedRef: async (objectId: string) => ({ objectId, initialSharedVersion: "1" }),
}));
vi.mock("./turnkey.server", () => ({ turnkeyConfigured: () => true, signSuiTransaction: mocks.sign }));

import { sendFromBankWallet, sendManyFromBankWallet, paySuiSplit, commitPresaleFromBankWallet } from "./bank-wallet.server";
import { buildLaunchpadBuySwap } from "./launchpad-buy.server";

const SENDER = normalizeSuiAddress("0x1");
const RECIPIENT = normalizeSuiAddress("0x2");
const SUI = "0x2::sui::SUI";
const COIN_ID = normalizeSuiAddress("0x18");
const COIN_MIST = 118_460_000_000n;
const ACCUMULATOR_MIST = 43_590_000_000n;
const SPEND_MIST = 160_000_000_000n;
const wallet = {
  address: SENDER, x_username: "unsigned-test", user_id: null,
  secret_ciphertext: null, signing_backend: "turnkey", turnkey_key_id: "unsigned-test", turnkey_public_key: "unsigned-test",
};

function mixedBalanceClient(coinMist = COIN_MIST, accumulatorMist = ACCUMULATOR_MIST) {
  const client = new SuiGraphQLClient({ url: "https://graphql.mainnet.sui.io/graphql", network: "mainnet" });
  // Exercise the SDK's portable core resolver against isolated fixtures,
  // rather than GraphQL's remote resolve/simulate plugin.
  vi.spyOn(client.core, "resolveTransactionPlugin").mockReturnValue(undefined as unknown as ReturnType<typeof client.core.resolveTransactionPlugin>);
  vi.spyOn(client, "query").mockRejectedValue(new Error("Unexpected network request"));
  vi.spyOn(client.core, "getBalance").mockResolvedValue({ balance: {
    coinType: SUI, balance: String(coinMist + accumulatorMist), coinBalance: String(coinMist), addressBalance: String(accumulatorMist),
  } });
  vi.spyOn(client.core, "listCoins").mockResolvedValue({ objects: coinMist > 0n ? [{
    objectId: COIN_ID, version: "1", digest: "11111111111111111111111111111111",
    owner: { $kind: "AddressOwner", AddressOwner: SENDER }, type: SUI, balance: String(coinMist),
  }] : [], hasNextPage: false, cursor: null });
  vi.spyOn(client.core, "getChainIdentifier").mockResolvedValue({ chainIdentifier: "11111111111111111111111111111111" });
  vi.spyOn(client.core, "getCurrentSystemState").mockResolvedValue({ systemState: {
    epoch: "1000", referenceGasPrice: "1000", systemStateVersion: "2", protocolVersion: "100", epochStartTimestampMs: "0",
    safeMode: false, safeModeStorageRewards: "0", safeModeComputationRewards: "0", safeModeStorageRebates: "0", safeModeNonRefundableStorageFee: "0",
    parameters: { epochDurationMs: "86400000", stakeSubsidyStartEpoch: "0", maxValidatorCount: "100", minValidatorJoiningStake: "0", validatorLowStakeThreshold: "0", validatorLowStakeGracePeriod: "0" },
    storageFund: { totalObjectStorageRebates: "0", nonRefundableBalance: "0" },
    stakeSubsidy: { balance: "0", distributionCounter: "0", currentDistributionAmount: "0", stakeSubsidyPeriodLength: "0", stakeSubsidyDecreaseRate: 0 },
  } });
  // No transport requests, signing, simulation or submission is permitted.
  vi.spyOn(client.core, "simulateTransaction").mockRejectedValue(new Error("Unexpected simulation"));
  vi.spyOn(client.core, "executeTransaction").mockRejectedValue(new Error("Never broadcast regression tests"));
  return client;
}

async function assertMixedGas(tx: Transaction) {
  expect(tx.getData().gasData.payment).toBeNull();
  const client = mixedBalanceClient();
  const bytes = await tx.build({ client });
  expect(bytes.length).toBeGreaterThan(0);
  const payment = tx.getData().gasData.payment ?? [];
  expect(payment).toHaveLength(2);
  expect(payment.some((ref) => ref.objectId === COIN_ID)).toBe(true);
  const reservation = payment.find((ref) => ref.version === "0");
  if (!reservation) throw new Error("Missing accumulator gas reservation");
  const raw = fromBase58(reservation.digest);
  const reserved = new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getBigUint64(0, true);
  expect(reserved).toBe(43_590_000_000n);
  expect(COIN_MIST + reserved).toBe(162_050_000_000n);
  expect(COIN_MIST + reserved - SPEND_MIST).toBeGreaterThanOrEqual(BigInt(tx.getData().gasData.budget ?? "0"));
  expect(client.core.executeTransaction).not.toHaveBeenCalled();
}

describe("SUI mixed coin and accumulator gas regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockImplementation(async (tx: Transaction) => {
      await assertMixedGas(tx);
      return { ok: false, digest: null, error: "Unsigned test only" };
    });
  });

  it("builds a 160 SUI send using 118.46 coin SUI plus 43.59 accumulator SUI", async () => {
    const result = await sendFromBankWallet(wallet, SUI, SPEND_MIST, RECIPIENT);
    expect(result).toEqual({ ok: false, error: "Unsigned test only" });
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("includes accumulator funds in send-all gas smashing", async () => {
    await sendFromBankWallet(wallet, SUI, null, RECIPIENT);
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("uses the combined balance for split SUI payments totaling 160 SUI", async () => {
    await paySuiSplit(wallet, [{ to: RECIPIENT, amount: 80_000_000_000n }, { to: SENDER, amount: 80_000_000_000n }]);
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("uses the combined balance for batch sends containing 160 SUI", async () => {
    await sendManyFromBankWallet(wallet, [{ coinType: SUI, amount: SPEND_MIST }], RECIPIENT);
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("uses the combined balance for a 160 SUI presale commit", async () => {
    mocks.execute.mockImplementation(async (tx: Transaction) => {
      expect(tx.getData().gasData.payment).toBeNull();
      const intent = tx.getData().commands.find((c) => c.$kind === "$Intent");
      expect(intent?.$Intent?.data['balance']).toBe(160_000_000_000n);
      return { ok: false, digest: null, error: "Unsigned test only" };
    });
    await commitPresaleFromBankWallet(wallet, { pkg: "0x3", presaleId: "0x4", memeType: "0x5::cant::CANT", amount: SPEND_MIST });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it.each(["blastv2", "blastfun", "suipump"] as const)("builds a 160 SUI %s curve buy with both balance sources", async (pad) => {
    const built = await buildLaunchpadBuySwap(SENDER, { pad, coinType: "0x5::cant::CANT", poolObjectId: "0x4", priceConfigId: "0x6" }, SPEND_MIST, 1n);
    if (!built) throw new Error("Missing curve transaction");
    withBankGas(built.tx, SENDER, 1000, 50_000_000n);
    await assertMixedGas(built.tx);
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("still resolves gas when all SUI is in the accumulator", async () => {
    const tx = new Transaction();
    withBankGas(tx, SENDER, 1000, 10_000_000n);
    tx.transferObjects([tx.gas], tx.pure.address(RECIPIENT));
    await tx.build({ client: mixedBalanceClient(0n, 162_050_000_000n) });
    expect(tx.getData().gasData.payment).toHaveLength(1);
    expect(tx.getData().gasData.payment?.[0]?.version).toBe("0");
  });
});