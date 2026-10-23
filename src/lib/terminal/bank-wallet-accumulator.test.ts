// SPDX-License-Identifier: BUSL-1.1
import { Transaction } from "@mysten/sui/transactions";
import { describe, expect, it } from "vitest";

import { tokenSendSource, type TokenSourceDeps } from "./bank-wallet.server";

const ONE = "0xaaffd090e6e6b9e1bae56e34b5a1e0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0::suipump::SUIPUMP";
const SENDER = "0x656775fdc913eaac6dbf3b266b6d43b0d3b713e91aab9d4998012ace44a46c2b";

function moveCalls(tx: Transaction): string[] {
  return tx
    .getData()
    .commands.filter((c) => c.$kind === "MoveCall")
    .map((c) => (c.$kind === "MoveCall" ? `${c.MoveCall.module}::${c.MoveCall.function}` : ""));
}
function kinds(tx: Transaction): string[] {
  return tx.getData().commands.map((c) => c.$kind);
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
  it("withdraws and redeems accumulator funds when no Coin objects exist", async () => {
    const tx = new Transaction();
    const out = await tokenSendSource(tx, SENDER, ONE, 1_000_000_000n, deps([], 66_141_509_509n));
    expect("error" in out).toBe(false);
    expect(moveCalls(tx)).toEqual(["coin::redeem_funds"]);
    expect(kinds(tx)).toContain("SplitCoins");
    expect(kinds(tx)).not.toContain("TransferObjects"); // the caller transfers
  });

  it("merges an accumulator top-up into existing Coin objects", async () => {
    const tx = new Transaction();
    const out = await tokenSendSource(tx, SENDER, ONE, 1_000n, deps([{ balance: "400" }], 1_000n));
    expect("error" in out).toBe(false);
    expect(moveCalls(tx)).toContain("coin::redeem_funds");
    expect(kinds(tx)).toContain("MergeCoins");
  });

  it("refuses when coins plus accumulator cannot cover the amount", async () => {
    const tx = new Transaction();
    const out = await tokenSendSource(tx, SENDER, ONE, 1_000n, deps([], 100n));
    expect(out).toEqual({ error: "Not enough SUIPUMP in your OurBank wallet." });
    expect(tx.getData().commands).toHaveLength(0);
  });

  it("send-all withdraws the full accumulator without splitting", async () => {
    const tx = new Transaction();
    const out = await tokenSendSource(tx, SENDER, ONE, null, deps([], 500n));
    expect("error" in out).toBe(false);
    expect(moveCalls(tx)).toContain("coin::redeem_funds");
    expect(kinds(tx)).not.toContain("SplitCoins");
  });

  it("uses Coin objects only when they already cover the amount", async () => {
    const tx = new Transaction();
    const out = await tokenSendSource(tx, SENDER, ONE, 100n, deps([{ balance: "1000" }], 0n));
    expect("error" in out).toBe(false);
    expect(moveCalls(tx)).toEqual([]);
    expect(kinds(tx)).toContain("SplitCoins");
  });
});
