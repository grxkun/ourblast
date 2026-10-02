// SPDX-License-Identifier: BUSL-1.1
/**
 * OurBlast launch path for RIPT (ript.fi), traced from RIPT's own launch client
 * and verified against the live Move signatures:
 *
 *   1. config::request_launch(config, fee coin) — pays RIPT's creation fee and
 *      emits LaunchRequested. RIPT allows one open request per wallet.
 *   2. POST https://api.ript.fi/api/v1/launches with the request digest and the
 *      token details. RIPT's backend mines a vanity coin, publishes it and
 *      registers a PendingLaunch<T> owned by the requester.
 *   3. Poll GET /launches/:jobId until status === "ready".
 *   4. launch::deploy_lp<T, SUI> opens the Bluefin pool with locked LP and sets
 *      the fee recipient (the launcher's wallet when known, else the bot).
 *
 * Nothing is reported as launched until Sui confirms the deploy transaction.
 */
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { deriveObjectID } from "@mysten/sui/utils";

import { deliverBoughtCoin, escrowCreatorSui, refundCreatorSui, type DevBuySigner, type OwnedSuiCoin } from "./devbuy-sui.server";
import { tokenIconUrl } from "./xLauncher";
import { gasCoins, loadDeployer, normalizeType, referenceGasPrice, rpc, sharedRef, signAndExecute, withGas } from "./suipump-launch.server";

export const RIPT_PACKAGE = "0xd086150b880d42da8e8da6466610bdccde9de67aede4302db3f7a7d59b0c5be5";
export const RIPT_CONFIG = "0x4dd0ed79110f890566226cd814d5e96c42d5146afff66bfd26e8dea16add2163";
const RIPT_DISTRIBUTOR_PACKAGE = "0x99ad8d11a4d4886e2af7f22be2f63526a4a880835b51f5957a7dda73bee74ca7";
const RIPT_DISTRIBUTOR_CONFIG = "0x85113e5f5b02e77329c4ab8a4cb324bf8415b38dc48e998bd86548bff7274c2a";
const BLUEFIN_GLOBAL_CONFIG = "0x03db251ba509a8d5d8777b6338836082335d93eecbdd09a11e190a1cff51c352";
const RIPT_API = "https://api.ript.fi/api/v1";
const SUI = "0x2::sui::SUI";
const CLOCK = "0x6";
const REQUEST_BUDGET = 100_000_000;
const DEPLOY_BUDGET = 500_000_000;
const GAS_HEADROOM_MIST = 600_000_000n;
const JOB_TIMEOUT_MS = 120_000;

export interface RiptLaunchInput {
  symbol: string;
  name: string;
  description: string;
  iconUrl: string;
  website?: string | null;
  xLink?: string | null;
  telegram?: string | null;
  /** Wallet that receives the pool's creator fees; null keeps them with the bot. */
  creatorWallet?: string | null;
  /** Creator's opening buy in SUI (null/0 = none). Funded by devBuyer, never the bot. */
  devBuySui?: number | null;
  /** The creator's OurBank wallet: funds and receives the first buy. */
  devBuyer?: DevBuySigner | null;
}

export interface RiptLaunchResult {
  status: "CONFIRMED" | "FAILED";
  error: string | null;
  digest: string | null;
  requestDigest: string | null;
  coinType: string | null;
  poolId: string | null;
  feeRecipient: string | null;
  /** Set when the launch succeeded but the first buy did not go through. */
  devBuyError: string | null;
}

interface RiptJob {
  jobId?: string;
  status?: string;
  coinType?: string;
  pendingLaunchId?: string;
  error?: string;
}

const fail = (error: string, extra: Partial<RiptLaunchResult> = {}): RiptLaunchResult => ({
  status: "FAILED",
  error,
  digest: null,
  requestDigest: null,
  coinType: null,
  poolId: null,
  feeRecipient: null,
  devBuyError: null,
  ...extra,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const short = (value: string | null | undefined, max: number) => (value ?? "").trim().slice(0, max);
const httpUrl = (value: string | null | undefined) => {
  const v = short(value, 300);
  return /^https?:\/\//i.test(v) ? v : undefined;
};

/** Coin types RIPT keys the registry under: struct name upper-cased. */
export function riptCurrencyId(coinType: string): string {
  const parts = normalizeType(coinType).split("::");
  const tag = parts.length === 3 ? `${parts[0]}::${parts[1]}::${parts[2]!.toUpperCase()}` : coinType;
  return deriveObjectID("0xc", `0x2::coin_registry::CurrencyKey<${tag}>`, bcs.bool().serialize(false).toBytes());
}

interface Receipt {
  ok: boolean;
  error: string | null;
  created: { objectId: string; objectType: string }[];
  events: { type: string; parsedJson: Record<string, unknown> }[];
}

async function receipt(digest: string): Promise<Receipt> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const block = await rpc<{
      effects?: { status?: { status?: string; error?: string } };
      events?: { type?: string; parsedJson?: Record<string, unknown> }[];
      objectChanges?: { type: string; objectId?: string; objectType?: string }[];
    }>("sui_getTransactionBlock", [digest, { showEffects: true, showEvents: true, showObjectChanges: true }]).catch(() => null);
    const status = block?.effects?.status?.status;
    if (status) {
      return {
        ok: status === "success",
        error: status === "success" ? null : block?.effects?.status?.error ?? "Transaction failed.",
        created: (block?.objectChanges ?? [])
          .filter((c) => c.type === "created" && c.objectId && c.objectType)
          .map((c) => ({ objectId: c.objectId as string, objectType: normalizeType(c.objectType as string) })),
        events: (block?.events ?? [])
          .filter((e) => typeof e.type === "string")
          .map((e) => ({ type: normalizeType(e.type as string), parsedJson: e.parsedJson ?? {} })),
      };
    }
    await sleep(1500);
  }
  return { ok: false, error: "Transaction not visible on chain.", created: [], events: [] };
}

async function freshGas(sender: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const coins = await gasCoins(sender).catch(() => []);
    if (coins.length > 0) return coins;
    await sleep(1500);
  }
  return [];
}

async function riptSettings(): Promise<{ fee: bigint; paused: boolean }> {
  const result = await rpc<{ data?: { content?: { fields?: { creation_fee_mist?: string; paused?: boolean } } | null } }>(
    "sui_getObject",
    [RIPT_CONFIG, { showContent: true }],
  );
  const fields = result.data?.content?.fields;
  if (!fields?.creation_fee_mist) throw new Error("Could not read RIPT's launch settings.");
  return { fee: BigInt(fields.creation_fee_mist), paused: Boolean(fields.paused) };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${RIPT_API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(`RIPT API ${res.status}: ${body.error ?? "request failed"}`);
  return body;
}

async function pollJob(jobId: string): Promise<RiptJob> {
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  let last: RiptJob = {};
  while (Date.now() < deadline) {
    last = await api<RiptJob>(`/launches/${encodeURIComponent(jobId)}`).catch(() => last);
    if (last.status === "ready" || last.status === "failed" || last.status === "deployed") return last;
    await sleep(3000);
  }
  return last;
}

export async function launchOnRipt(input: RiptLaunchInput): Promise<RiptLaunchResult> {
  const symbol = input.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(symbol)) return fail("Ticker must be 2–10 letters/digits starting with a letter.");
  const name = short(input.name, 64) || symbol;
  const description = short(input.description, 280) || `${name} — launched on RIPT via OurBlast.`;
  const iconUrl = tokenIconUrl(input.iconUrl).slice(0, 300);

  const keypair = await loadDeployer();
  if (!keypair) return fail("The bot launch wallet is not configured.");
  const sender = keypair.getPublicKey().toSuiAddress();
  const feeRecipient = input.creatorWallet ?? sender;

  let settings: { fee: bigint; paused: boolean };
  try {
    settings = await riptSettings();
  } catch (error) {
    return fail((error as Error).message);
  }
  if (settings.paused) return fail("RIPT launches are paused right now.");

  const balance = await rpc<{ totalBalance?: string }>("suix_getBalance", [sender, SUI])
    .then((r) => BigInt(r.totalBalance ?? "0"))
    .catch(() => 0n);
  if (balance > 0n && balance < settings.fee + GAS_HEADROOM_MIST) {
    return fail(`The bot wallet needs about ${Number(settings.fee + GAS_HEADROOM_MIST) / 1e9} SUI for RIPT's fee and gas.`);
  }

  // RIPT rejects icons it cannot fetch; check before paying the fee.
  try {
    await api("/uploads/icon/check", { method: "POST", body: JSON.stringify({ iconUrl }) });
  } catch (error) {
    return fail(`RIPT could not use the token image: ${(error as Error).message}`);
  }

  const gasPrice = await referenceGasPrice().catch(() => 1000);

  // Step 1 — request the launch on chain.
  const [configRef, requestGas] = await Promise.all([sharedRef(RIPT_CONFIG), freshGas(sender)]);
  if (requestGas.length === 0) return fail("The bot wallet has no SUI coin left to pay gas.");
  const requestTx = new Transaction();
  withGas(requestTx, sender, requestGas, gasPrice, REQUEST_BUDGET);
  const [feeCoin] = requestTx.splitCoins(requestTx.gas, [requestTx.pure.u64(settings.fee)]);
  requestTx.moveCall({
    target: `${RIPT_PACKAGE}::config::request_launch`,
    arguments: [requestTx.sharedObjectRef({ ...configRef, mutable: true }), feeCoin!],
  });
  const requestRun = await signAndExecute(requestTx, keypair);
  if (!requestRun.ok || !requestRun.digest) return fail(requestRun.error ?? "RIPT launch request failed.");
  const requested = await receipt(requestRun.digest);
  if (!requested.ok || !requested.events.some((e) => e.type.endsWith("::LaunchRequested"))) {
    return fail(requested.error ?? "RIPT launch request did not confirm.", { requestDigest: requestRun.digest });
  }
  const requestDigest = requestRun.digest;

  // Step 2 — hand the details to RIPT's publisher.
  let job: RiptJob;
  try {
    job = await api<RiptJob>("/launches", {
      method: "POST",
      body: JSON.stringify({
        creatorAddress: sender,
        txDigest: requestDigest,
        name,
        symbol,
        description,
        iconUrl,
        website: httpUrl(input.website),
        twitter: httpUrl(input.xLink),
        telegram: httpUrl(input.telegram),
      }),
    });
  } catch (error) {
    return fail(`RIPT did not accept the launch: ${(error as Error).message}`, { requestDigest });
  }
  if (!job.jobId) return fail("RIPT did not return a launch job.", { requestDigest });

  // Step 3 — wait for the vanity coin + PendingLaunch.
  if (job.status !== "ready") job = await pollJob(job.jobId);
  if (job.status !== "ready" || !job.coinType || !job.pendingLaunchId) {
    return fail(
      job.status === "failed"
        ? `RIPT could not publish the coin: ${job.error ?? "unknown error"}`
        : "RIPT took too long to publish the coin; the paid request stays open and can be resumed.",
      { requestDigest },
    );
  }
  const coinType = normalizeType(job.coinType);

  // Creator-funded first buy: the creator escrows exactly the buy SUI to the
  // bot, and the bot spends that very coin in the deploy transaction — the
  // buy lands in the same block the pool opens. The bot's own SUI is never used.
  const devBuyMist =
    input.devBuySui && input.devBuySui > 0 && input.devBuyer ? BigInt(Math.round(input.devBuySui * 1e9)) : 0n;
  let escrow: OwnedSuiCoin | null = null;
  let devBuyError: string | null = null;
  if (devBuyMist > 0n && input.devBuyer) {
    const moved = await escrowCreatorSui({ buyer: input.devBuyer, bot: sender, amountMist: devBuyMist, gasPrice });
    escrow = moved.coin;
    if (!escrow) devBuyError = `First buy skipped: ${moved.error}`;
  }

  return deployRiptLp(keypair, sender, gasPrice, coinType, job.pendingLaunchId, feeRecipient, requestDigest, escrow, input.devBuyer ?? null, devBuyError);
}

/** Step 4 — open the Bluefin pool. Exported so a paid, published request can be resumed. */
export async function deployRiptLp(
  keypair: NonNullable<Awaited<ReturnType<typeof loadDeployer>>>,
  sender: string,
  gasPrice: number,
  coinType: string,
  pendingLaunchId: string,
  feeRecipient: string,
  requestDigest: string,
  /** Creator-escrowed SUI coin for the first buy; null = no buy. */
  buyCoin: OwnedSuiCoin | null = null,
  /** Creator wallet that funded the buy (receives the bought tokens). */
  devBuyer: DevBuySigner | null = null,
  devBuyError: string | null = null,
): Promise<RiptLaunchResult> {
  const currencyId = riptCurrencyId(coinType);
  /** Returns the escrowed buy coin to the creator; appends the outcome to the error. */
  const refundEscrow = async (error: string, extra: Partial<RiptLaunchResult> = {}): Promise<RiptLaunchResult> => {
    if (!buyCoin || !devBuyer) return fail(error, extra);
    const refundError = await refundCreatorSui({ keypair, bot: sender, coin: buyCoin, to: devBuyer.address, gasPrice });
    return fail(`${error} ${refundError ?? "The first-buy SUI was returned to the creator."}`, extra);
  };
  const [cfgRef, currencyRef, clockRef, bluefinRef, distributorRef, pendingRef, deployGas] = await Promise.all([
    sharedRef(RIPT_CONFIG),
    sharedRef(currencyId).catch(() => null),
    sharedRef(CLOCK),
    sharedRef(BLUEFIN_GLOBAL_CONFIG),
    sharedRef(RIPT_DISTRIBUTOR_CONFIG),
    sharedRef(pendingLaunchId).catch(() => null),
    freshGas(sender),
  ]);
  if (!currencyRef) return refundEscrow("RIPT published the coin but its registry entry is not visible yet.", { requestDigest, coinType });
  if (!pendingRef) return refundEscrow("RIPT's pending launch object is not visible yet.", { requestDigest, coinType });
  const deployGasSafe = deployGas.filter((g) => g.objectId !== buyCoin?.coinObjectId);
  if (deployGasSafe.length === 0) return refundEscrow("The bot wallet has no SUI coin left to pay gas.", { requestDigest, coinType });

  const tx = new Transaction();
  withGas(tx, sender, deployGasSafe, gasPrice, DEPLOY_BUDGET);
  const policy = tx.moveCall({ target: `${RIPT_DISTRIBUTOR_PACKAGE}::distributor::policy_to_fee_recipient` });
  const quoteZero = tx.moveCall({ target: "0x2::coin::zero", typeArguments: [SUI] });
  // The creator's escrowed coin is the first buy; an empty coin when none.
  const buyArg = buyCoin
    ? tx.objectRef({ objectId: buyCoin.coinObjectId, version: buyCoin.version, digest: buyCoin.digest })
    : tx.moveCall({ target: "0x2::coin::zero", typeArguments: [SUI] });
  tx.moveCall({
    target: `${RIPT_PACKAGE}::launch::deploy_lp`,
    typeArguments: [coinType, SUI],
    arguments: [
      tx.sharedObjectRef({ ...cfgRef, mutable: true }),
      tx.sharedObjectRef({ ...pendingRef, mutable: true }),
      tx.sharedObjectRef({ ...currencyRef, mutable: true }),
      tx.sharedObjectRef({ ...clockRef, mutable: false }),
      tx.sharedObjectRef({ ...bluefinRef, mutable: true }),
      quoteZero,
      buyArg,
      policy,
      tx.pure.address(feeRecipient),
      tx.sharedObjectRef({ ...distributorRef, mutable: false }),
    ],
  });
  const run = await signAndExecute(tx, keypair);
  if (!run.ok || !run.digest) return refundEscrow(run.error ?? "RIPT pool deploy failed.", { requestDigest, coinType });
  const deployed = await receipt(run.digest);
  if (!deployed.ok) return refundEscrow(deployed.error ?? "RIPT pool deploy failed on chain.", { requestDigest, coinType, digest: run.digest });
  const poolId = deployed.created.find((c) => /::pool::Pool</.test(c.objectType))?.objectId ?? null;

  // The bought tokens land in the bot wallet (it sent the deploy); hand them
  // to the creator who funded the buy.
  if (buyCoin && devBuyer) {
    const deliverError = await deliverBoughtCoin({ keypair, bot: sender, coinType, to: devBuyer.address, gasPrice });
    if (deliverError) devBuyError = `First buy executed but ${deliverError}`;
  }

  return { status: "CONFIRMED", error: null, digest: run.digest, requestDigest, coinType, poolId, feeRecipient, devBuyError };
}
