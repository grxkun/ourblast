// SPDX-License-Identifier: BUSL-1.1
/**
 * Perpsplexity creator-fee claims with the OurBlast 80/10/10 split.
 * The bot wallet is the pool's recorded creator. composite_pool::pay_creator
 * sends the accrued USDC to the bot (it returns nothing), so the claim is two
 * transactions: (1) pay_creator, (2) split exactly the claimed amount to the
 * payees. The bot's own USDC is never touched beyond the claimed amount.
 */
import { Transaction } from "@mysten/sui/transactions";

import { PERPSPLEXITY_PACKAGE_ID, PERPSPLEXITY_QUOTE_TYPE } from "./perpsplexity";
import { splitAmounts } from "./popular-claim.server";
import { gasCoins, loadDeployer, referenceGasPrice, rpc, sharedRef, signAndExecute, withGas } from "./suipump-launch.server";

const BUDGET = 50_000_000;

export interface PerpsPoolFees {
  poolId: string;
  typeArgs: string[];
  creator: string;
  pendingUnits: bigint;
}

export async function readPerpsPoolFees(poolId: string): Promise<PerpsPoolFees | null> {
  const obj = await rpc<{ data?: { type?: string } }>("sui_getObject", [poolId, { showType: true }]).catch(() => null);
  const inner = obj?.data?.type?.match(/::composite_pool::CompositePool<(.+)>$/)?.[1];
  if (!inner) return null;
  const typeArgs = inner.split(/,\s*/);
  if (typeArgs.length !== 3) return null;
  const fields = await rpc<{ data: { name: { type: string }; objectId: string }[] }>("suix_getDynamicFields", [poolId, null, 50]).catch(() => null);
  const field = fields?.data?.find((f) => f.name.type.endsWith("::composite_pool::CreatorKey"));
  if (!field) return { poolId, typeArgs, creator: "", pendingUnits: 0n };
  const df = await rpc<{ data?: { content?: { fields?: { value?: { fields?: { creator?: string; funds?: string } } } } } }>(
    "sui_getObject",
    [field.objectId, { showContent: true }],
  ).catch(() => null);
  const value = df?.data?.content?.fields?.value?.fields;
  return {
    poolId,
    typeArgs,
    creator: String(value?.creator ?? "").toLowerCase(),
    pendingUnits: BigInt(String(value?.funds ?? "0")),
  };
}

/** Finds the CompositePool created by a launch transaction. */
export async function findPerpsPoolId(digest: string | null): Promise<string | null> {
  if (!digest) return null;
  const tx = await rpc<{ objectChanges?: { type: string; objectType?: string; objectId?: string }[] }>(
    "sui_getTransactionBlock", [digest, { showObjectChanges: true }],
  ).catch(() => null);
  return tx?.objectChanges?.find((c) => (c.type === "created" || c.type === "mutated") && Boolean(c.objectType?.includes("::composite_pool::CompositePool<")))?.objectId ?? null;
}

async function usdcCoins(owner: string): Promise<{ coinObjectId: string; balance: string }[]> {
  const res = await rpc<{ data: { coinObjectId: string; balance: string }[] }>("suix_getCoins", [owner, PERPSPLEXITY_QUOTE_TYPE, null, 50]);
  return res.data ?? [];
}

export async function claimPerpsCreatorFees(
  poolId: string,
  payees: string[],
  shareBps: number[],
): Promise<{ ok: boolean; message: string; digest: string | null; claimedUsdc: number }> {
  const fail = (message: string, digest: string | null = null) => ({ ok: false, message, digest, claimedUsdc: 0 });
  const keypair = await loadDeployer();
  const bot = keypair?.getPublicKey().toSuiAddress().toLowerCase();
  if (!keypair || !bot) return fail("the bot wallet is not configured");
  if (payees.length === 0 || payees.length !== shareBps.length) return fail("the fee split is not set");
  const pool = await readPerpsPoolFees(poolId);
  if (!pool) return fail("the Perpsplexity pool could not be read");
  if (pool.creator !== bot) return fail("the creator role is held by another wallet — claim on perpsplexity.app");
  if (pool.pendingUnits < 10_000n) return fail("no fees waiting yet");
  const amount = pool.pendingUnits;

  // 1) pay_creator → USDC lands in the bot wallet.
  const [poolRef, gas, gasPrice] = await Promise.all([sharedRef(poolId), gasCoins(bot), referenceGasPrice()]);
  if (gas.length === 0) return fail("the bot wallet has no SUI for gas");
  const pay = new Transaction();
  withGas(pay, bot, gas, gasPrice, BUDGET);
  pay.moveCall({
    target: `${PERPSPLEXITY_PACKAGE_ID}::composite_pool::pay_creator`,
    typeArguments: pool.typeArgs,
    arguments: [pay.sharedObjectRef({ ...poolRef, mutable: true })],
  });
  const paid = await signAndExecute(pay, keypair);
  if (!paid.ok) return fail(paid.error ?? "pay_creator failed on chain", paid.digest ?? null);

  // 2) split exactly the claimed amount to the payees.
  let coins: { coinObjectId: string; balance: string }[] = [];
  for (let i = 0; i < 10; i += 1) {
    coins = await usdcCoins(bot).catch(() => []);
    if (coins.reduce((s, c) => s + BigInt(c.balance), 0n) >= amount) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (coins.reduce((s, c) => s + BigInt(c.balance), 0n) < amount) {
    return fail(`fees claimed to the bot (tx ${paid.digest}) but the split is pending — retry`, paid.digest ?? null);
  }
  const [gas2, gasPrice2] = await Promise.all([gasCoins(bot), referenceGasPrice()]);
  const split = new Transaction();
  withGas(split, bot, gas2, gasPrice2, BUDGET);
  const [primary, ...rest] = coins.map((c) => split.object(c.coinObjectId));
  if (rest.length) split.mergeCoins(primary!, rest);
  const amounts = splitAmounts(amount, shareBps);
  const parts = split.splitCoins(primary!, amounts.map((a) => split.pure.u64(a)));
  payees.forEach((payee, i) => split.transferObjects([parts[i]!], payee));
  const sent = await signAndExecute(split, keypair);
  if (!sent.ok) return fail(`fees claimed (tx ${paid.digest}) but the split failed: ${sent.error ?? "unknown"}`, paid.digest ?? null);
  return { ok: true, message: "claimed", digest: sent.digest ?? null, claimedUsdc: Number(amount) / 1e6 };
}
