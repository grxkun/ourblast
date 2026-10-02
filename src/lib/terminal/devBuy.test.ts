/**
 * The first ("dev") buy must always be paid by the creator's own OurBank wallet
 * and delivered to that wallet. The bot's operating wallet only ever covers gas,
 * the launch fee and the 1 USDC pool seed, so these tests assert that the bot's
 * SUI and USDC are never touched by a first buy.
 */
import { Transaction } from "@mysten/sui/transactions";
import { beforeEach, describe, expect, it, vi } from "vitest";

const BOT = "0x489e7b801fa43b8ba11038733e3909d3cdd6db3c21bd0e80dc9704f77c148f7d";
const CREATOR = "0x1111111111111111111111111111111111111111111111111111111111111111";

/** owner → { usdc base units, sui mist } */
const balances = new Map<string, { usdc: bigint; sui: bigint }>();
const rpcCalls: { method: string; params: unknown[] }[] = [];
const signed: { sender: string | null | undefined; signerAddress: string; tx: Transaction }[] = [];
let mockActivationFails = false;

const fakeCoin = (owner: string, balance: bigint) => ({
  coinObjectId: `0xc01d${owner.slice(6)}`,
  version: "1",
  digest: "11111111111111111111111111111111",
  balance: balance.toString(),
});

vi.mock("@/lib/terminal/suipump-launch.server", () => ({
  normalizeType: (value: string) => value,
  referenceGasPrice: async () => 1000,
  loadDeployer: async () => ({ address: BOT, signTransaction: async () => ({ signature: "bot" }) }),
  gasCoins: async (owner: string) => [
    { objectId: `0x9a50${owner.slice(6)}`, version: "1", digest: "11111111111111111111111111111111" },
  ],
  withGas: (tx: Transaction, sender: string, gas: { objectId: string; version: string; digest: string }[]) => {
    tx.setSender(sender);
    tx.setGasPayment(gas);
    tx.setGasBudget(1_000_000_000);
    tx.setGasPrice(1000);
  },
  withSponsoredGas: (
    tx: Transaction,
    sender: string,
    sponsor: string,
    gas: { objectId: string; version: string; digest: string }[],
  ) => {
    tx.setSender(sender);
    tx.setGasOwner(sponsor);
    tx.setGasPayment(gas);
    tx.setGasBudget(1_000_000_000);
    tx.setGasPrice(1000);
  },
  sharedRef: async (id: string) => ({ objectId: id, initialSharedVersion: "1" }),
  signAndExecute: async (tx: Transaction, signer: { address: string }) => {
    signed.push({ sender: tx.getData().sender, signerAddress: signer.address, tx });
    if (mockActivationFails) {
      const calls = tx
        .getData()
        .commands.filter((command) => "MoveCall" in command)
        .map((command) => (command as { MoveCall: { function: string } }).MoveCall.function);
      if (calls.includes("activate")) return { ok: false, digest: null, error: "activation failed" };
    }
    return { ok: true, digest: "DEVBUYDIGEST", error: null };
  },
  rpc: async (method: string, params: unknown[]) => {
    rpcCalls.push({ method, params });
    if (method === "suix_getCoins") {
      const owner = params[0] as string;
      const held = balances.get(owner)?.usdc ?? 0n;
      return { data: held > 0n ? [fakeCoin(owner, held)] : [] };
    }
    if (method === "suix_getBalance") {
      const owner = params[0] as string;
      return { totalBalance: (balances.get(owner)?.sui ?? 0n).toString() };
    }
    if (method === "sui_getTransactionBlock") {
      return { effects: { status: { status: "success" } }, events: [], objectChanges: [] };
    }
    return { data: null };
  },
}));

const launch = () => import("@/lib/terminal/perpsplexity-launch.server");

const creatorSigner = {
  address: CREATOR,
  signTransaction: async () => ({ signature: "creator" }),
};

beforeEach(() => {
  rpcCalls.length = 0;
  signed.length = 0;
  balances.clear();
  mockActivationFails = false;
  // The bot is well funded; a first buy must still never come out of it.
  balances.set(BOT, { usdc: 21_440_000n, sui: 50_900_000_000n });
});

describe("first buy funding", () => {
  it("charges a funded creator wallet, never the bot wallet", async () => {
    balances.set(CREATOR, { usdc: 10_000_000n, sui: 2_000_000_000n });
    const { planDevBuy } = await launch();
    const plan = await planDevBuy({
      name: "Test",
      symbol: "TEST",
      description: "",
      iconUrl: "",
      devBuyUsdc: 0.1,
      devBuyer: { address: CREATOR, signer: creatorSigner },
    });

    expect(plan.skip).toBeNull();
    expect(plan.units).toBe(100_000n); // 0.1 USDC
    expect(plan.buyer?.address).toBe(CREATOR);
    // Only the creator's wallet was inspected for funds.
    const owners = rpcCalls
      .filter((call) => call.method === "suix_getCoins" || call.method === "suix_getBalance")
      .map((call) => call.params[0]);
    expect(owners.every((owner) => owner === CREATOR)).toBe(true);
    expect(owners).not.toContain(BOT);
  });

  it("sends the bought position to the creator and signs with their wallet", async () => {
    balances.set(CREATOR, { usdc: 10_000_000n, sui: 2_000_000_000n });
    const { buyOnCurve } = await launch();
    const result = await buyOnCurve({
      keypair: creatorSigner,
      sender: CREATOR,
      coinType: `0x${"c".repeat(64)}::test::TEST`,
      poolId: `0x${"b".repeat(64)}`,
      amount: 100_000n,
      gasPrice: 1000,
      freshGas: async () => [
        {
          objectId: `0x${"a".repeat(64)}`,
          version: "1",
          digest: "11111111111111111111111111111111",
          type: "0x2::coin::Coin<0x2::sui::SUI>",
        },
      ],
    });

    expect(result.error).toBeNull();
    expect(result.digest).toBe("DEVBUYDIGEST");
    expect(signed).toHaveLength(1);
    // The creator's wallet signs and pays, and the transaction is sent from it.
    expect(signed[0]!.signerAddress).toBe(CREATOR);
    expect(signed[0]!.sender).toBe(CREATOR);

    const data = signed[0]!.tx.getData();
    // The USDC spent is a creator-owned coin, never a bot coin.
    const spent = JSON.stringify(data.inputs);
    expect(spent).toContain(fakeCoin(CREATOR, 10_000_000n).coinObjectId);
    expect(spent).not.toContain(fakeCoin(BOT, 21_440_000n).coinObjectId);
    // The purchased position goes to the creator.
    const transfer = data.commands.find((command) => "TransferObjects" in command);
    expect(transfer).toBeTruthy();
    const recipientInput = data.inputs[
      (transfer as { TransferObjects: { address: { Input: number } } }).TransferObjects.address.Input
    ];
    const recipientBytes = Buffer.from(
      (recipientInput as { Pure: { bytes: string } }).Pure.bytes,
      "base64",
    ).toString("hex");
    expect(`0x${recipientBytes}`).toBe(CREATOR);
    // The bot's balances were never even read for this buy.
    expect(rpcCalls.filter((call) => call.params[0] === BOT)).toHaveLength(0);
  });

  it("uses the live composite cash purchase path and delivers its position to the creator", async () => {
    balances.set(CREATOR, { usdc: 10_000_000n, sui: 2_000_000_000n });
    const { buyOnCompositePool } = await launch();
    const result = await buyOnCompositePool({
      keypair: creatorSigner,
      sender: CREATOR,
      coinType: `0x${"c".repeat(64)}::sam3l::SAM3L`,
      prepared: {
        pool: `0x${"1".repeat(64)}`,
        engine: `0x${"2".repeat(64)}`,
        engineAccount: `0x${"3".repeat(64)}`,
        engineSleeve: `0x${"4".repeat(64)}`,
        engineVault: `0x${"5".repeat(64)}`,
        poolSleeve: `0x${"6".repeat(64)}`,
        reserve: `0x${"7".repeat(64)}`,
        reserveAccount: `0x${"8".repeat(64)}`,
        poolCap: {
          objectId: `0x${"9".repeat(64)}`,
          version: "1",
          digest: "11111111111111111111111111111111",
        },
      },
      market: {
        marketId: `0x${"a".repeat(64)}`,
        baseOracleId: `0x${"b".repeat(64)}`,
        collateralOracleId: `0x${"d".repeat(64)}`,
        symbol: "SAMSUNGUSD",
        label: "SAMSUNG",
      },
      amount: 100_000n,
      gasPrice: 1000,
      freshGas: async () => [{
        objectId: `0x${"e".repeat(64)}`,
        version: "1",
        digest: "11111111111111111111111111111111",
        type: "0x2::coin::Coin<0x2::sui::SUI>",
      }],
    });

    expect(result).toEqual({ digest: "DEVBUYDIGEST", error: null });
    expect(signed).toHaveLength(1);
    expect(signed[0]?.sender).toBe(CREATOR);
    expect(signed[0]?.signerAddress).toBe(CREATOR);
    const commands = signed[0]?.tx.getData().commands ?? [];
    const calls = commands
      .filter((command) => "MoveCall" in command)
      .map((command) => (command as { MoveCall: { function: string } }).MoveCall.function);
    expect(calls).toEqual(["cash_prices", "buy_cash"]);
    expect(calls).not.toContain("buy");
    expect(calls).not.toContain("share");
    expect(commands.some((command) => "TransferObjects" in command)).toBe(true);
    // buy_cash takes the pool's own sleeve, reserve and reserve account. The
    // engine sleeve/vault/account trio aborts in basket::check_cash on chain.
    const buyCash = commands.find(
      (command) => "MoveCall" in command && (command as { MoveCall: { function: string } }).MoveCall.function === "buy_cash",
    ) as { MoveCall: { arguments: unknown[] } } | undefined;
    const inputs = signed[0]?.tx.getData().inputs ?? [];
    const objectAt = (index: number) => {
      const arg = buyCash?.MoveCall.arguments[index] as { Input?: number } | undefined;
      const input = arg?.Input === undefined ? undefined : (inputs[arg.Input] as { Object?: { SharedObject?: { objectId: string; mutable: boolean } } });
      return input?.Object?.SharedObject;
    };
    expect(objectAt(2)).toMatchObject({ objectId: `0x${"6".repeat(64)}`, mutable: true });
    expect(objectAt(3)?.objectId).toBe(`0x${"7".repeat(64)}`);
    expect(objectAt(4)?.objectId).toBe(`0x${"8".repeat(64)}`);
    expect(rpcCalls.filter((call) => call.params[0] === BOT)).toHaveLength(0);
  });

  it("can ride inside the activation transaction, creator-sent and bot-sponsored", async () => {
    balances.set(CREATOR, { usdc: 10_000_000n, sui: 2_000_000_000n });
    const { appendCompositeBuy } = await launch();
    const { withSponsoredGas } = await import("@/lib/terminal/suipump-launch.server");
    const refs = {
      pool: { objectId: `0x${"1".repeat(64)}`, initialSharedVersion: "1" },
      config: { objectId: `0x${"c".repeat(64)}`, initialSharedVersion: "1" },
      engine: { objectId: `0x${"2".repeat(64)}`, initialSharedVersion: "1" },
      engineAccount: { objectId: `0x${"3".repeat(64)}`, initialSharedVersion: "1" },
      engineSleeve: { objectId: `0x${"4".repeat(64)}`, initialSharedVersion: "1" },
      engineVault: { objectId: `0x${"5".repeat(64)}`, initialSharedVersion: "1" },
      poolSleeve: { objectId: `0x${"6".repeat(64)}`, initialSharedVersion: "1" },
      reserve: { objectId: `0x${"7".repeat(64)}`, initialSharedVersion: "1" },
      reserveAccount: { objectId: `0x${"8".repeat(64)}`, initialSharedVersion: "1" },
      lendingMarket: { objectId: `0x${"a".repeat(64)}`, initialSharedVersion: "1" },
      clearingHouse: { objectId: `0x${"b".repeat(64)}`, initialSharedVersion: "1" },
      registry: { objectId: `0x${"d".repeat(64)}`, initialSharedVersion: "1" },
      baseFeed: { objectId: `0x${"e".repeat(64)}`, initialSharedVersion: "1" },
      collateralFeed: { objectId: `0x${"f".repeat(64)}`, initialSharedVersion: "1" },
      clock: { objectId: "0x6", initialSharedVersion: "1" },
    } as never;

    const tx = new Transaction();
    // The creator sends (they hold the pool cap and the USDC); the bot pays gas.
    withSponsoredGas(tx, CREATOR, BOT, [
      { objectId: `0x${"9".repeat(64)}`, version: "1", digest: "11111111111111111111111111111111", type: "0x2::coin::Coin<0x2::sui::SUI>" },
    ], 1000, 1_500_000_000);
    appendCompositeBuy(tx, {
      coinType: `0x${"c".repeat(64)}::sam3l::SAM3L`,
      refs,
      buyer: CREATOR,
      coins: [fakeCoin(CREATOR, 10_000_000n)],
      amount: 100_000n,
    });

    const data = tx.getData();
    expect(data.sender).toBe(CREATOR);
    // Gas comes from the bot, so the creator only ever spends USDC.
    expect(data.gasData.owner).toBe(BOT);
    const calls = data.commands
      .filter((command) => "MoveCall" in command)
      .map((command) => (command as { MoveCall: { function: string } }).MoveCall.function);
    // The buy sits in the same block as activation, leaving snipers no window.
    expect(calls).toEqual(["cash_prices", "buy_cash"]);
    expect(JSON.stringify(data.inputs)).toContain(fakeCoin(CREATOR, 10_000_000n).coinObjectId);
  });

  it("skips the buy and still launches when the creator has no USDC", async () => {
    balances.set(CREATOR, { usdc: 0n, sui: 2_000_000_000n });
    const { planDevBuy } = await launch();
    const plan = await planDevBuy({
      name: "Test",
      symbol: "TEST",
      description: "",
      iconUrl: "",
      devBuyUsdc: 25,
      devBuyer: { address: CREATOR, signer: creatorSigner },
    });

    expect(plan.units).toBe(0n);
    expect(plan.buyer).toBeNull();
    expect(plan.skip).toContain("First buy skipped");
    expect(signed).toHaveLength(0);
  });

  it("skips the buy when the creator cannot cover gas", async () => {
    balances.set(CREATOR, { usdc: 30_000_000n, sui: 10_000_000n });
    const { planDevBuy } = await launch();
    const plan = await planDevBuy({
      name: "Test",
      symbol: "TEST",
      description: "",
      iconUrl: "",
      devBuyUsdc: 25,
      devBuyer: { address: CREATOR, signer: creatorSigner },
    });

    expect(plan.buyer).toBeNull();
    expect(plan.skip).toContain("SUI");
  });

  it("skips the buy when the creator has no OurBank wallet", async () => {
    const { planDevBuy } = await launch();
    const plan = await planDevBuy({
      name: "Test",
      symbol: "TEST",
      description: "",
      iconUrl: "",
      devBuyUsdc: 25,
      devBuyer: null,
    });

    expect(plan.units).toBe(0n);
    expect(plan.skip).toContain("no wallet was available");
    // Nothing was charged anywhere, least of all the bot.
    expect(signed).toHaveLength(0);
    expect(rpcCalls.filter((call) => call.params[0] === BOT)).toHaveLength(0);
  });

  it("refunds the escrowed first-buy USDC to the creator when activation fails", async () => {
    balances.set(CREATOR, { usdc: 10_000_000n, sui: 2_000_000_000n });
    mockActivationFails = true;
    const { activateComposite } = await launch();
    // The creator's 0.1 USDC already sits in the bot wallet (escrow path).
    const escrowCoin = fakeCoin(BOT, 100_000n);
    const result = await activateComposite({
      keypair: { address: BOT, signTransaction: async () => ({ signature: "bot" }) } as never,
      sender: BOT,
      coinType: `0x${"c".repeat(64)}::test::TEST`,
      packageId: `0x${"d".repeat(64)}`,
      prepared: {
        pool: `0x${"1".repeat(64)}`,
        engine: `0x${"2".repeat(64)}`,
        engineAccount: `0x${"3".repeat(64)}`,
        engineSleeve: `0x${"4".repeat(64)}`,
        engineVault: `0x${"5".repeat(64)}`,
        poolSleeve: `0x${"6".repeat(64)}`,
        reserve: `0x${"7".repeat(64)}`,
        reserveAccount: `0x${"8".repeat(64)}`,
        poolCap: {
          objectId: `0x${"9".repeat(64)}`,
          version: "1",
          digest: "11111111111111111111111111111111",
        },
      } as never,
      market: {
        marketId: `0x${"a".repeat(64)}`,
        baseOracleId: `0x${"b".repeat(64)}`,
        collateralOracleId: `0x${"d".repeat(64)}`,
        symbol: "SAMSUNGUSD",
        label: "SAMSUNG",
      } as never,
      devBuy: { units: 100_000n, buyer: { address: CREATOR, signer: creatorSigner }, skip: null } as never,
      gasPrice: 1000,
      freshGas: async () => [
        {
          objectId: `0x${"e".repeat(64)}`,
          version: "1",
          digest: "11111111111111111111111111111111",
          type: "0x2::coin::Coin<0x2::sui::SUI>",
        },
      ],
      freshGasFor: async () => [
        {
          objectId: `0x${"f".repeat(64)}`,
          version: "1",
          digest: "11111111111111111111111111111111",
          type: "0x2::coin::Coin<0x2::sui::SUI>",
        },
      ],
      prepareDigest: "PREPDIGEST",
      escrowCoin,
    });

    expect(result.status).toBe("FAILED");
    expect(result.error).toContain("returned to the creator");
    // A bot-signed transfer handed the exact escrowed coin back to the creator.
    const refund = signed.find((entry) =>
      entry.tx.getData().commands.some((command) => "TransferObjects" in command),
    );
    expect(refund).toBeTruthy();
    expect(refund!.signerAddress).toBe(BOT);
    const data = refund!.tx.getData();
    expect(JSON.stringify(data.inputs)).toContain(escrowCoin.coinObjectId);
    const transfer = data.commands.find((command) => "TransferObjects" in command);
    const recipientInput = data.inputs[
      (transfer as { TransferObjects: { address: { Input: number } } }).TransferObjects.address.Input
    ];
    const recipientBytes = Buffer.from(
      (recipientInput as { Pure: { bytes: string } }).Pure.bytes,
      "base64",
    ).toString("hex");
    expect(`0x${recipientBytes}`).toBe(CREATOR);
  });
});

describe("launch tweets that mention a dev buy", () => {
  it("is not mistaken for an OurBank trade", async () => {
    const { parseDeployTweet } = await import("@/lib/terminal/xLauncher");
    const parsed = parseDeployTweet(
      "@Ourblastbot launch on Perpsplexity Ticker: $TEST Name: Test Underlying: SAMSUNG Position: Long Leverage: 3x Dev buy: 0.1",
    );
    expect(parsed?.symbol).toBe("TEST");
    expect(parsed?.devBuyUsdc).toBe(0.1);
    expect(parsed?.perps?.underlying).toBe("SAMSUNG");
  });

  it("reads the dev buy as SUI on POPULAR and RIPT, USDC on Perpsplexity", async () => {
    const { parseDeployTweet } = await import("@/lib/terminal/xLauncher");
    const popular = parseDeployTweet("@Ourblastbot launch on Popular, $POPCAT, Pop Cat, Dev buy 25 SUI");
    expect(popular?.devBuySui).toBe(25);
    expect(popular?.devBuyUsdc).toBeUndefined();
    const ript = parseDeployTweet("@Ourblastbot launch on ript.fi, $RIPTCAT, Ript Cat, first buy 10");
    expect(ript?.devBuySui).toBe(10);
    expect(ript?.devBuyUsdc).toBeUndefined();
    const suipump = parseDeployTweet("@Ourblastbot launch $DOG Sui Dog, dev buy 5");
    expect(suipump?.devBuySui).toBe(5);
    expect(suipump?.devBuyUsdc).toBeUndefined();
  });

  it("does not let a 'sui' tag after the amount bleed into the token name", async () => {
    const { parseDeployTweet } = await import("@/lib/terminal/xLauncher");
    const parsed = parseDeployTweet(
      "@Ourblastbot launch on Perpsplexity Ticker: $TEST Name: test Underlying: SAMSUNG Position: Long Leverage: 3x Dev buy: 0.1 sui",
    );
    expect(parsed?.symbol).toBe("TEST");
    expect(parsed?.name.toLowerCase()).toBe("test");
    expect(parsed?.devBuyUsdc).toBe(0.1);
  });
});
