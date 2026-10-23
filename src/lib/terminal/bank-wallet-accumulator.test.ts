// SPDX-License-Identifier: BUSL-1.1
import { Transaction } from "@mysten/sui/transactions";
import { describe, expect, it } from "vitest";

import { tokenSendSource, type TokenSourceDeps } from "./bank-wallet.server";

const ONE = "0xaaffd090e6e6b9e1bae56e34b5a1e0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0::suipump::SUIPUMP";
const SENDER = "0x656775fdc913eaac6dbf3b266b6d43b0d3b713e91aab9d4998012ace44a46c2b";

function intents(tx: Transaction): string[] {
  return tx
    .getData()
    .commands.filter((c) => c.$kind === "$Intent")
    .map((c) => (c.$kind === "$Intent" ? c.$Intent.name : ""));
}

function deps(coins: { balance: string }[], acc: bigint): TokenSourceDeps {
  return {
    getCoins: async () =>
      coins.map((c, i) => ({
        coinObjectId: `0x${String(i + 1).padStart(64, "0")}`,
        version: "1",
        digest: "11111111111111111111111111111111",
        balance: c.balance,
      })),
    addressBalance: async () => acc,
  };
}

describe("tokenSendSource address accumulator", () => {
  it("uses the coin-with-balance intent when funds sit in the accumulator", async () => {
    const tx = new Transaction();
    const out = await tokenSendSource(tx, SENDER, ONE, 1_000_000_000n, deps([], 66_141_509_509n));
    expect("error" in out).toBe(false);
    expect(intents(tx)).toEqual(["CoinWithBalance"]);
  });

  it("uses one intent when coins plus accumulator cover the amount", async () => {
    const tx = new Transaction();
    const out = await tokenSendSource(tx, SENDER, ONE, 1_000n, deps([{ balance: "400" }], 1_000n));
    expect("error" in out).toBe(false);
    expect(intents(tx)).toEqual(["CoinWithBalance"]);
  });

  it("refuses when coins plus accumulator cannot cover the amount", async () => {
    const tx = new Transaction();
    const out = await tokenSendSource(tx, SENDER, ONE, 1_000n, deps([], 100n));
    expect(out).toEqual({ error: "Not enough SUIPUMP in your OurBank wallet." });
    expect(tx.getData().commands).toHaveLength(0);
  });

  it("send-all covers coins plus the full accumulator", async () => {
    const tx = new Transaction();
    const out = await tokenSendSource(tx, SENDER, ONE, null, deps([{ balance: "100" }], 500n));
    expect("error" in out).toBe(false);
    expect(intents(tx)).toEqual(["CoinWithBalance"]);
  });

  it("refuses send-all when the wallet holds nothing", async () => {
    const tx = new Transaction();
    const out = await tokenSendSource(tx, SENDER, ONE, null, deps([], 0n));
    expect(out).toEqual({ error: "No SUIPUMP coins in your OurBank wallet." });
    expect(tx.getData().commands).toHaveLength(0);
  });
});
