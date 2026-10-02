// SPDX-License-Identifier: BUSL-1.1
/**
 * POPULAR creator-fee claims with the OurBlast 80/10/10 split. POPULAR pays
 * creator fees to one address, so the bot keeps the curve's creator role and,
 * on claim, takes the fees and splits them in the same transaction:
 * developer and treasury get their exact share, the launcher gets the rest.
 */
import { Transaction } from "@mysten/sui/transactions";

import { POPULAR_CONFIG, POPULAR_LATEST_PACKAGE } from "./popular-launch.server";
import { gasCoins, loadDeployer, referenceGasPrice, rpc, sharedRef, signAndExecute, withGas } from "./suipump-launch.server";

const CLAIM_BUDGET = 50_000_000;

export interface PopularCurveFees {
  curveId: string;
  coinType: string;
  creator: string;
  pendingMist: bigint;
}

export async function readPopularCurveFees(curveId: string): Promise<PopularCurveFees | null> {
  const obj = await rpc<{ data?: { type?: string; content?: { fields?: Record<string, unknown> } } }>("sui_getObject", [
    curveId,
    { showType: true, showContent: true },
  ]).catch(() => null);
  const type = obj?.data?.type ?? "";
  const coinType = type.match(/::curve::Curve<(.+)>$/)?.[1];
  const fields = obj?.data?.content?.fields;
  if (!coinType || !fields) return null;
  return {
    curveId,
    coinType,
    creator: String(fields["creator"] ?? "").toLowerCase(),
    pendingMist: BigInt(String(fields["creator_fees"] ?? "0")),
  };
}

/** Exact per-payee amounts; the last payee (the launcher) takes the rounding remainder. */
export function splitAmounts(totalMist: bigint, shareBps: number[]): bigint[] {
  const head = shareBps.slice(0, -1).map((bps) => (totalMist * BigInt(bps)) / 10_000n);
  return [...head, totalMist - head.reduce((a, b) => a + b, 0n)];
}

export async function claimPopularCreatorFees(
  curveId: string,
  payees: string[],
  shareBps: number[],
): Promise<{ ok: boolean; message: string; digest: string | null; claimedSui: number }> {
  const keypair = await loadDeployer();
  const bot = keypair?.getPublicKey().toSuiAddress().toLowerCase();
  if (!keypair || !bot) return { ok: false, message: "the bot wallet is not configured", digest: null, claimedSui: 0 };
  const curve = await readPopularCurveFees(curveId);
  if (!curve) return { ok: false, message: "the POPULAR curve could not be read", digest: null, claimedSui: 0 };
  if (curve.creator !== bot) {
    return { ok: false, message: "the creator role is held by the launcher's own wallet — claim on popularsui.xyz", digest: null, claimedSui: 0 };
  }
  if (curve.pendingMist <= 0n) return { ok: false, message: "no fees waiting yet", digest: null, claimedSui: 0 };
  if (payees.length === 0 || payees.length !== shareBps.length) {
    return { ok: false, message: "the fee split is not set", digest: null, claimedSui: 0 };
  }

  const [curveRef, cfgRef, gas, gasPrice] = await Promise.all([
    sharedRef(curveId),
    sharedRef(POPULAR_CONFIG),
    gasCoins(bot),
    referenceGasPrice(),
  ]);
  if (gas.length === 0) return { ok: false, message: "the bot wallet has no SUI for gas", digest: null, claimedSui: 0 };

  const amounts = splitAmounts(curve.pendingMist, shareBps);
  const tx = new Transaction();
  withGas(tx, bot, gas, gasPrice, CLAIM_BUDGET);
  const [fees] = tx.moveCall({
    target: `${POPULAR_LATEST_PACKAGE}::curve::claim_creator_fees`,
    typeArguments: [curve.coinType],
    arguments: [tx.sharedObjectRef({ ...curveRef, mutable: true }), tx.sharedObjectRef({ ...cfgRef, mutable: false })],
  });
  const parts = tx.splitCoins(fees!, amounts.slice(0, -1).map((a) => tx.pure.u64(a)));
  payees.slice(0, -1).forEach((payee, i) => tx.transferObjects([parts[i]!], payee));
  // Whatever the claim returned beyond the split goes to the launcher.
  tx.transferObjects([fees!], payees[payees.length - 1]!);

  const run = await signAndExecute(tx, keypair);
  if (!run.ok) return { ok: false, message: run.error ?? "the claim failed on chain", digest: run.digest ?? null, claimedSui: 0 };
  return { ok: true, message: "claimed", digest: run.digest ?? null, claimedSui: Number(curve.pendingMist) / 1e9 };
}
