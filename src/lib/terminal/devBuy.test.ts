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
const QUOTE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

/** owner → { usdc base units, sui mist } */
const balances = new Map<string, { usdc: bigint; sui: bigint }>();
const rpcCalls: { method: string; params: unknown[] }[] = [];
const signed: { sender: string | null | undefined; signerAddress: string; tx: Transaction }[] = [];

const fakeCoin = (owner: string, balance: bigint) => ({
  coinObjectId: `0xc01n${owner.slice(6)}`,
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
  sharedRef: async (id: string) => ({ objectId: id, initialSharedVersion: "1" }),
  signAndExecute: async (tx: Transaction, signer: { address: string }) => {
    signed.push({ sender: tx.getData().sender, signerAddress: signer.address, tx });
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
        { objectId: `0x${"a".repeat(64)}`, version: "1", digest: "11111111111111111111111111111111" },
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
    expect(JSON.stringify(transfer)).toContain(CREATOR.slice(2, 20));
    // The bot's balances were never even read for this buy.
    expect(rpcCalls.filter((call) => call.params[0] === BOT)).toHaveLength(0);
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
});

void QUOTE;
