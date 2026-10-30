// SPDX-License-Identifier: BUSL-1.1
import { Transaction } from "@mysten/sui/transactions";
import { normalizeStructTag, normalizeSuiAddress } from "@mysten/sui/utils";

import { findSuipumpToken } from "./suipump.server";
import { rpc, sharedRef } from "./suipump-launch.server";

/**
 * Direct bonding-curve buys for unbonded tokens (still on the launchpad curve,
 * not yet migrated to a DEX pool). The DEX aggregators (Bluefin / Aftermath /
 * Cetus) only see migrated-pool liquidity, so an unbonded token has no route
 * there — this module calls the launchpad's own `buy` Move function instead.
 *
 * On-chain signatures were verified against live mainnet packages before this
 * code was written (never invented):
 *
 *  Suipump  bonding_curve::buy<T>(&mut Curve<T>, Coin<SUI>, u64 min_out,
 *            Option<Address> partner, &PriceConfig, &Clock, &mut TxContext)
 *            -> (Coin<T>, Coin<SUI> refund)
 *
 *  Blast.fun memez_pump::pump<T, Q>(&mut MemezFun<Pump, T, Q>, Coin<Q>,
 *            Option<Address>, Option<Vec<u8>>, u64 min_out, AllowedVersions,
 *            &mut TxContext) -> Coin<T>
 *
 * Perpsplexity is intentionally NOT here: composite_pool::buy needs a perp
 * account, clearing house, custody vault, lending market and price feeds
 * (18 args) — it is a leveraged perp flow, not a bonding-curve swap, and is
 * left to the aggregators once a token graduates to DEX liquidity.
 */

const SUI = normalizeStructTag("0x2::sui::SUI");
const CLOCK = "0x0000000000000000000000000000000000000000000000000000000000000006";
// Calls target the latest upgraded Suipump package (V2); types stay under the original id.
const SUICOMP = "0xb90fc5f4cd6558a63e0d99fee3ed67c1893e65b21d0a19c126885f5e45ba78ac";
const SUICOMP_MODULE = "bonding_curve";

// Blast.fun constants — mirror blastfun-launch.server.ts.
const MEMEZ_FUN_LATEST = "0x7e6aa6e179466ab2814425a780b122575296d011119fa69d27f289f5a28814bd";
const VERSION = { objectId: "0x2319e3e76dfad73d8f4684bdbf42be4f32d8ce4521dd61becc8261dc918d82c0", initialSharedVersion: "597477043" };

// Blast v2 (interest-protocol/blast-v2-contracts), verified on mainnet:
//   launch::buy<M, Q>(&mut Launch<M,Q>, &PackageVersion, &RuntimeConfig, Coin<Q>, u64 min_out) -> (Coin<M>, Coin<Q> refund)
//   launch::sell<M, Q>(&mut Launch<M,Q>, &PackageVersion, &RuntimeConfig, Coin<M>, u64 min_out) -> Coin<Q>
export const BLAST_V2_LAUNCH_PKG = "0x079a1b44c551613cbc63cc0406f8ff8d717407378dd6f17d43d9e1b3fd63a573";
const BLAST_V2_VERSION = { objectId: "0xe63adb5817a9a74a883062ac3790d21a6433dfbd35a9403d18261de3a8836f93", initialSharedVersion: "2" };
const BLAST_V2_RUNTIME = { objectId: "0x6d0c08363ebc1e2a77f16fed290dd0cd5f52791285744d758a3b0942073b6785", initialSharedVersion: "1" };

/** Finds the shared Blast v2 Launch<coinType, SUI> object for a coin, if one exists. */
async function findBlastV2Launch(coinType: string): Promise<string | null> {
  const { suiGql } = await import("./sui-rpc-compat.server");
  const type = `${BLAST_V2_LAUNCH_PKG}::launch::Launch<${coinType}, ${SUI}>`;
  const r = await suiGql<{ objects?: { nodes?: { address: string }[] } }>(
    `query($t: String!) { objects(first: 1, filter: { type: $t }) { nodes { address } } }`,
    { t: type },
  );
  return r.objects?.nodes?.[0]?.address ?? null;
}

export interface LaunchpadBuiltSwap {
  tx: Transaction;
  quoted: bigint;
  venue: "Suipump" | "Blast.fun";
}

export interface LaunchpadBuyPlan {
  pad: "suipump" | "blastfun" | "blastv2";
  coinType: string;
  poolObjectId: string;
  priceConfigId?: string;
}

interface SuipumpCurveInfo {
  coinType: string;
  curveId: string;
  priceConfigId: string;
  graduated: boolean;
}

/** Reads a Suipump Curve shared object to get its coin type, price config and graduation state. */
async function readSuipumpCurve(curveId: string): Promise<SuipumpCurveInfo | null> {
  const obj = await rpc<{
    data?: { type?: string; content?: { dataType?: string; fields?: Record<string, unknown> } };
  }>("sui_getObject", [curveId, { showType: true, showContent: true }]);
  const type = obj.data?.type ?? "";
  // type: 0xb205…::bonding_curve::Curve<0x…::coin::COIN>
  const m = type.match(/Curve<(.+)>$/);
  if (!m) return null;
  const coinType = normalizeStructTag(m[1]!);
  const fields = obj.data?.content?.dataType === "moveObject" ? obj.data.content.fields ?? {} : {};
  const graduated = Boolean(fields["graduated"]);
  const priceConfigId = String(fields["price_config_id"] ?? "");
  if (!priceConfigId) return null;
  return { coinType, curveId, priceConfigId, graduated };
}

/**
 * Resolves whether `coinOut` is an unbonded launchpad token we can buy directly
 * from its bonding curve. Tries Suipump (by coin type via the public feed, then
 * by curve object id for the launch panel which passes the curveId), then
 * Blast.fun (by our own stored pool object id). Returns null when nothing
 * matches so the caller falls back to the DEX aggregators.
 */
export async function resolveLaunchpadBuy(coinOut: string): Promise<LaunchpadBuyPlan | null> {
  // Bare 0x ids are curve/pool object ids (Suipump launch rows), not struct tags.
  const outType = coinOut.includes("::") ? normalizeStructTag(coinOut) : normalizeSuiAddress(coinOut);

  // Suipump by coin type (terminal / X mentions pass the full coin type).
  try {
    const sum = await findSuipumpToken(outType);
    if (sum && sum.poolState === "curve") {
      const info = await readSuipumpCurve(sum.curveId);
      if (info && !info.graduated) {
        return { pad: "suipump", coinType: info.coinType, poolObjectId: info.curveId, priceConfigId: info.priceConfigId };
      }
    }
  } catch {
    /* suipump feed unavailable — try the curve-object path below */
  }

  // Suipump by curve object id (the Launch Activity panel passes the curveId as
  // token_address for Suipump launches).
  try {
    const info = await readSuipumpCurve(outType);
    if (info && !info.graduated) {
      return { pad: "suipump", coinType: info.coinType, poolObjectId: info.curveId, priceConfigId: info.priceConfigId };
    }
  } catch {
    /* not a Curve object — not a Suipump direct buy */
  }

  // Blast v2 Launch object by coin type (any creator, not only OURBLAST launches).
  if (outType.includes("::")) {
    try {
      const launchId = await findBlastV2Launch(outType);
      if (launchId) return { pad: "blastv2", coinType: outType, poolObjectId: launchId };
    } catch {
      /* GraphQL unavailable — try the legacy Blast.fun path */
    }
  }

  // Blast.fun (legacy MemezFun) by our own stored MemezFun pool object id (token_address is the
  // coin type; pool_object_id holds the shared MemezFun object).
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("x_launch_requests")
      .select("pool_object_id")
      .eq("launchpad", "blastfun")
      .eq("token_address", outType)
      .not("pool_object_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const poolObjectId = data?.[0]?.pool_object_id as string | undefined;
    if (poolObjectId) return { pad: "blastfun", coinType: outType, poolObjectId };
  } catch {
    /* Blast.fun lookup failed — fall through */
  }

  return null;
}

/** Builds the launchpad-direct buy transaction (unsigned) for the resolved plan. */
export async function buildLaunchpadBuySwap(
  sender: string,
  plan: LaunchpadBuyPlan,
  amountIn: bigint,
  minOut: bigint = 0n,
): Promise<LaunchpadBuiltSwap | null> {
  if (plan.pad === "suipump") return buildSuipumpBuy(sender, plan, amountIn, minOut);
  if (plan.pad === "blastfun") return buildBlastfunBuy(sender, plan, amountIn, minOut);
  if (plan.pad === "blastv2") return buildBlastV2Buy(sender, plan, amountIn, minOut);
  return null;
}

/**
 * Suipump bonding-curve buy. min_out is 0 because the Suipump curve does not
 * expose a verifiable read-only quote function and we must not invent a price
 * formula; the transaction is simulated before signing (the shared signing
 * path), and the real received amount is read from the confirmed balance
 * changes. Keep amounts modest — like any bonding curve, the price moves with
 * each buy.
 */
async function buildSuipumpBuy(
  sender: string,
  plan: LaunchpadBuyPlan,
  amountIn: bigint,
  minOut: bigint = 0n,
): Promise<LaunchpadBuiltSwap> {
  const curveRef = await sharedRef(plan.poolObjectId);
  const priceConfigRef = await sharedRef(plan.priceConfigId!);
  const tx = new Transaction();
  tx.setSender(sender);
  const [coinIn] = tx.splitCoins(tx.gas, [amountIn]);
  // buy returns (Coin<T>, Coin<SUI> refund) — both go back to the sender.
  const buyResult = tx.moveCall({
    target: `${SUICOMP}::${SUICOMP_MODULE}::buy`,
    typeArguments: [plan.coinType],
    arguments: [
      tx.sharedObjectRef({ ...curveRef, mutable: true }),
      coinIn,
      tx.pure.u64(minOut),
      tx.pure.option("address", null),
      tx.sharedObjectRef({ ...priceConfigRef, mutable: false }),
      tx.sharedObjectRef({ objectId: CLOCK, initialSharedVersion: "1", mutable: false }),
    ],
  });
  tx.transferObjects([buyResult[0]!, buyResult[1]!], tx.pure.address(sender));
  return { tx, quoted: 0n, venue: "Suipump" };
}

/** Blast.fun bonding-curve buy (memez_pump::pump). AllowedVersions is rebuilt from the shared VERSION object, exactly as the launch does. */
async function buildBlastfunBuy(
  sender: string,
  plan: LaunchpadBuyPlan,
  amountIn: bigint,
  minOut: bigint = 0n,
): Promise<LaunchpadBuiltSwap> {
  const poolRef = await sharedRef(plan.poolObjectId);
  const tx = new Transaction();
  tx.setSender(sender);
  const [coinIn] = tx.splitCoins(tx.gas, [amountIn]);
  const versions = tx.moveCall({
    target: `${MEMEZ_FUN_LATEST}::memez_allowed_versions::get_allowed_versions`,
    arguments: [tx.sharedObjectRef({ ...VERSION, mutable: false })],
  });
  const pumpResult = tx.moveCall({
    target: `${MEMEZ_FUN_LATEST}::memez_pump::pump`,
    typeArguments: [plan.coinType, SUI],
    arguments: [
      tx.sharedObjectRef({ ...poolRef, mutable: true }),
      coinIn,
      tx.pure.option("address", null),
      tx.pure.option("vector<u8>", null),
      tx.pure.u64(minOut),
      versions,
    ],
  });
  tx.transferObjects([pumpResult[0]!], tx.pure.address(sender));
  return { tx, quoted: 0n, venue: "Blast.fun" };
}

function blastV2Common(tx: Transaction, launchRef: { objectId: string; initialSharedVersion: string }) {
  return [
    tx.sharedObjectRef({ ...launchRef, mutable: true }),
    tx.sharedObjectRef({ ...BLAST_V2_VERSION, mutable: false }),
    tx.sharedObjectRef({ ...BLAST_V2_RUNTIME, mutable: false }),
  ];
}

/** Blast v2 curve buy. Returns (Coin<Meme>, Coin<SUI> refund) — both go back to the sender. */
async function buildBlastV2Buy(sender: string, plan: LaunchpadBuyPlan, amountIn: bigint, minOut: bigint): Promise<LaunchpadBuiltSwap> {
  const launchRef = await sharedRef(plan.poolObjectId);
  const tx = new Transaction();
  tx.setSender(sender);
  const [coinIn] = tx.splitCoins(tx.gas, [amountIn]);
  const r = tx.moveCall({
    target: `${BLAST_V2_LAUNCH_PKG}::launch::buy`,
    typeArguments: [plan.coinType, SUI],
    arguments: [...blastV2Common(tx, launchRef), coinIn!, tx.pure.u64(minOut)],
  });
  tx.transferObjects([r[0]!, r[1]!], tx.pure.address(sender));
  return { tx, quoted: 0n, venue: "Blast.fun" };
}

/**
 * Suipump bonding-curve sell (verified on mainnet V2):
 *   bonding_curve::sell<T>(&mut Curve<T>, Coin<T>, u64 min_out, Option<address>, &mut TxContext) -> Coin<SUI>
 * Suipump and Blast v2 curves are sold directly; legacy MemezFun sells still go via DEX routes.
 */
export async function buildLaunchpadSellSwap(
  sender: string,
  plan: LaunchpadBuyPlan,
  amountIn: bigint,
  minOut: bigint = 0n,
): Promise<LaunchpadBuiltSwap | null> {
  if (plan.pad === "blastv2") {
    const launchRef = await sharedRef(plan.poolObjectId);
    const tx = new Transaction();
    tx.setSender(sender);
    const coinIn = tx.coin({ balance: amountIn, type: plan.coinType });
    const out = tx.moveCall({
      target: `${BLAST_V2_LAUNCH_PKG}::launch::sell`,
      typeArguments: [plan.coinType, SUI],
      arguments: [...blastV2Common(tx, launchRef), coinIn, tx.pure.u64(minOut)],
    });
    tx.transferObjects([out], tx.pure.address(sender));
    return { tx, quoted: 0n, venue: "Blast.fun" };
  }
  if (plan.pad !== "suipump") return null;
  const curveRef = await sharedRef(plan.poolObjectId);
  const tx = new Transaction();
  tx.setSender(sender);
  // Coin intent draws from coin objects and the address balance.
  const coinIn = tx.coin({ balance: amountIn, type: plan.coinType });
  const suiOut = tx.moveCall({
    target: `${SUICOMP}::${SUICOMP_MODULE}::sell`,
    typeArguments: [plan.coinType],
    arguments: [
      tx.sharedObjectRef({ ...curveRef, mutable: true }),
      coinIn,
      tx.pure.u64(minOut),
      tx.pure.option("address", null),
    ],
  });
  tx.transferObjects([suiOut], tx.pure.address(sender));
  return { tx, quoted: 0n, venue: "Suipump" };
}
