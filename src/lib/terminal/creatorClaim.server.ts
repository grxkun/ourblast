/**
 * Creator-fee vault claiming on Suipump.
 *
 * Suipump accumulates each token's creator fee inside its Curve object and
 * releases it with `bonding_curve::claim_creator_fees(&CreatorCap, &mut Curve,
 * &Clock)`. That single call pays every payee written into the curve at launch
 * (bot, dev, treasury, launcher) in their on-chain shares — so one
 * press distributes everything, with nobody needing a Suipump account.
 *
 * OURBLAST keeps the CreatorCap in the bot wallet, which is why the terminal can
 * trigger the distribution at all. It never changes where the money goes: the
 * recipients and shares are fixed on chain at launch.
 */

import { Transaction } from "@mysten/sui/transactions";

import {
  gasCoins,
  loadDeployer,
  readSuipumpConfig,
  referenceGasPrice,
  rpc,
  signAndExecute,
  withGas,
  normalizeType,
} from "./suipump-launch.server";

const CLOCK_ID = "0x0000000000000000000000000000000000000000000000000000000000000006";
const CLAIM_GAS_BUDGET_MIST = 60_000_000;
const MIST_PER_SUI = 1_000_000_000;

export interface CreatorFeeVault {
  /** Shared Curve object id — the vault identity used to claim. */
  curveId: string;
  capId: string;
  symbol: string;
  name: string;
  coinType: string;
  /** Unclaimed creator fees held by the curve, in MIST. */
  pendingMist: string;
  pendingSui: number;
  graduated: boolean;
  payouts: { recipient: string; bps: number }[];
}

interface ObjectData {
  objectId: string;
  version: string;
  digest: string;
  type?: string;
  owner?: { AddressOwner?: string; Shared?: { initial_shared_version: number } } | string;
  content?: { fields?: Record<string, unknown> };
}

async function readObject(objectId: string): Promise<ObjectData | null> {
  const result = await rpc<{ data?: ObjectData }>("sui_getObject", [
    objectId,
    { showType: true, showOwner: true, showContent: true },
  ]).catch(() => null);
  return result?.data ?? null;
}

function curveCoinType(type: string): string | null {
  const match = normalizeType(type).match(/::bonding_curve::Curve<(.+)>$/);
  return match?.[1] ?? null;
}

function readPayouts(fields: Record<string, unknown> | undefined): { recipient: string; bps: number }[] {
  const raw = (fields?.["payouts"] ?? []) as { fields?: { recipient?: string; bps?: string } }[];
  return raw
    .map((row) => ({
      recipient: String(row.fields?.recipient ?? "").toLowerCase(),
      bps: Number(row.fields?.bps ?? 0),
    }))
    .filter((row) => row.recipient.startsWith("0x"));
}

/** Every Suipump CreatorCap the owner holds, across all Suipump package versions. */
async function ownedCreatorCaps(owner: string): Promise<ObjectData[]> {
  const caps: ObjectData[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
    const res: { data: { data: ObjectData | null }[]; nextCursor?: string | null; hasNextPage?: boolean } | null =
      await rpc<{ data: { data: ObjectData | null }[]; nextCursor?: string | null; hasNextPage?: boolean }>(
        "suix_getOwnedObjects",
        [owner, { options: { showType: true, showContent: true } }, cursor, 50],
      ).catch(() => null);
    if (!res) break;
    for (const entry of res.data ?? []) {
      if (entry.data && /::bonding_curve::CreatorCap$/.test(entry.data.type ?? "")) caps.push(entry.data);
    }
    if (!res.hasNextPage || !res.nextCursor) break;
    cursor = res.nextCursor;
  }
  return caps;
}

const packageOf = (type?: string) => (type ?? "").split("::")[0] ?? "";

/** Every Suipump curve whose creator cap the bot wallet still holds. */
export async function listCreatorFeeVaults(): Promise<CreatorFeeVault[]> {
  const keypair = await loadDeployer();
  const bot = keypair?.getPublicKey().toSuiAddress();
  if (!bot) return [];
  const caps = await ownedCreatorCaps(bot);

  const vaults: CreatorFeeVault[] = [];
  for (const cap of caps) {
    const curveId = String(cap.content?.fields?.["curve_id"] ?? "");
    if (!curveId.startsWith("0x")) continue;
    const curve = await readObject(curveId);
    const coinType = curveCoinType(curve?.type ?? "");
    if (!curve || !coinType) continue;
    const fields = curve.content?.fields;
    const pendingMist = String(fields?.["creator_fees"] ?? "0");
    vaults.push({
      curveId,
      capId: cap.objectId,
      symbol: String(fields?.["symbol"] ?? "").toUpperCase(),
      name: String(fields?.["name"] ?? ""),
      coinType,
      pendingMist,
      pendingSui: Number(pendingMist) / MIST_PER_SUI,
      graduated: Boolean(fields?.["graduated"]),
      payouts: readPayouts(fields),
    });
  }
  return vaults.sort((a, b) => b.pendingSui - a.pendingSui);
}

export interface ClaimVaultResult {
  ok: boolean;
  message: string;
  digest: string | null;
  claimedSui: number;
}

/**
 * Releases one curve's accumulated creator fees to its on-chain payees. The
 * distribution itself is decided by Suipump from the shares written at launch.
 */
export async function claimCreatorFeeVault(curveId: string): Promise<ClaimVaultResult> {
  const config = readSuipumpConfig();
  const keypair = await loadDeployer();
  const sender = keypair?.getPublicKey().toSuiAddress();
  if (!keypair || !sender) {
    return { ok: false, message: "The launch wallet is not configured yet.", digest: null, claimedSui: 0 };
  }

  const curve = await readObject(curveId);
  const coinType = curveCoinType(curve?.type ?? "");
  if (!curve || !coinType || typeof curve.owner === "string" || !curve.owner?.Shared) {
    return { ok: false, message: "That token's fee vault could not be read on chain.", digest: null, claimedSui: 0 };
  }
  const pendingMist = Number(curve.content?.fields?.["creator_fees"] ?? 0);
  if (pendingMist <= 0) {
    return { ok: false, message: "There are no creator fees waiting for this token yet.", digest: null, claimedSui: 0 };
  }

  const caps = await ownedCreatorCaps(sender);
  const cap = caps
    .find((entry) => entry && String(entry.content?.fields?.["curve_id"] ?? "") === curveId);
  if (!cap) {
    return {
      ok: false,
      message: "OURBLAST does not hold the creator key for this token, so it cannot release its fees.",
      digest: null,
      claimedSui: 0,
    };
  }

  const coins = await gasCoins(sender);
  if (coins.length === 0) {
    return {
      ok: false,
      message: "The bot wallet has no SUI to pay network costs with. Send it a little SUI and try again.",
      digest: null,
      claimedSui: 0,
    };
  }
  const gasPrice = await referenceGasPrice();

  const tx = new Transaction();
  withGas(tx, sender, coins, gasPrice, CLAIM_GAS_BUDGET_MIST);
  tx.moveCall({
    target: `${packageOf(cap.type) || config.packageId}::bonding_curve::claim_creator_fees`,
    typeArguments: [coinType],
    arguments: [
      tx.objectRef({ objectId: cap.objectId, version: cap.version, digest: cap.digest }),
      tx.sharedObjectRef({
        objectId: curveId,
        initialSharedVersion: String(curve.owner.Shared.initial_shared_version),
        mutable: true,
      }),
      tx.sharedObjectRef({ objectId: CLOCK_ID, initialSharedVersion: "1", mutable: false }),
    ],
  });

  const executed = await signAndExecute(tx, keypair);
  if (!executed.ok) {
    return {
      ok: false,
      message: executed.error ?? "The network rejected the fee distribution, so nothing moved.",
      digest: executed.digest,
      claimedSui: 0,
    };
  }
  return {
    ok: true,
    message: "Creator fees distributed on chain.",
    digest: executed.digest,
    claimedSui: pendingMist / MIST_PER_SUI,
  };
}
