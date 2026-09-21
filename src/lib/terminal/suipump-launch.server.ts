import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

import { decryptConnectionKey } from "@/lib/connection-key.server";
import { MIST_PER_SUI } from "@/lib/ourblast.config";
import { fetchCoinTemplate, patchCoinTemplate } from "./coin-template.server";
import {
  SUIPUMP_CREATE_FUNCTION,
  SUIPUMP_ISSUER_KEY_DEFAULT,
  SUIPUMP_ISSUER_URL_DEFAULT,
  SUIPUMP_LAUNCH_FEE_SUI_DEFAULT,
  SUIPUMP_MODULE,
  SUIPUMP_PACKAGE_DEFAULT,
  SUIPUMP_REGISTRY_DEFAULT,
  SUIPUMP_TEMPLATE_URL_DEFAULT,
  SUIPUMP_TICKET_TYPE,
  type SuipumpDeployerStatus,
  type SuipumpLaunchConfig,
  type SuipumpLaunchResult,
} from "./suipump-launch";

/**
 * Real Suipump launch adapter, following the same public flow as suipump.org:
 * publish the public coin template, have Suipump's public issuer mint a launch
 * ticket to the publisher, then create the bonding curve. Public JSON-RPC
 * fullnodes are retired, so every read and both submissions go through the Sui
 * GraphQL service.
 *
 * Nothing is ever reported as launched unless Sui confirms the curve object.
 */

const GRAPHQL = "https://graphql.mainnet.sui.io/graphql";
const CLOCK_ID = "0x0000000000000000000000000000000000000000000000000000000000000006";
const PUBLISH_GAS_BUDGET_MIST = 500_000_000; // 0.5 SUI ceiling for the coin publish.
const CREATE_GAS_BUDGET_MIST = 300_000_000; // 0.3 SUI ceiling for the create call.
const GAS_HEADROOM_MIST = 900_000_000; // Publish + create gas we insist on having.

export async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(GRAPHQL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors[0]?.message ?? "Sui read failed.");
  if (!json.data) throw new Error("Sui read failed.");
  return json.data;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Operator-configurable settings; the defaults are Suipump's own public ones. */
export function readSuipumpConfig(): SuipumpLaunchConfig {
  return {
    packageId: process.env['SUIPUMP_PACKAGE_ID']?.trim() || SUIPUMP_PACKAGE_DEFAULT,
    registryId: process.env['SUIPUMP_LAUNCH_REGISTRY_ID']?.trim() || SUIPUMP_REGISTRY_DEFAULT,
    templateUrl: process.env['SUIPUMP_TEMPLATE_URL']?.trim() || SUIPUMP_TEMPLATE_URL_DEFAULT,
    issuerUrl: (process.env['SUIPUMP_ISSUER_URL']?.trim() || SUIPUMP_ISSUER_URL_DEFAULT).replace(/\/+$/, ""),
    issuerKey: process.env['SUIPUMP_ISSUER_KEY']?.trim() || SUIPUMP_ISSUER_KEY_DEFAULT,
    launchFeeMist: Math.max(
      0,
      Math.round(numberEnv("SUIPUMP_LAUNCH_FEE_SUI", SUIPUMP_LAUNCH_FEE_SUI_DEFAULT) * MIST_PER_SUI),
    ),
    decimals: Math.max(0, Math.min(18, Math.round(numberEnv("SUIPUMP_COIN_DECIMALS", 6)))),
    optionA: Math.min(255, Math.max(0, Math.round(numberEnv("SUIPUMP_CREATE_OPTION_A", 0)))),
    optionB: Math.min(255, Math.max(0, Math.round(numberEnv("SUIPUMP_CREATE_OPTION_B", 15)))),
    enabled: (process.env['SUIPUMP_LAUNCH_ENABLED'] ?? "true").trim().toLowerCase() !== "false",
  };
}

/**
 * Loads the OurBlastBot signer. The key comes from the encrypted gas-reserve
 * row (or the backend secret) and never leaves this module.
 */
export async function loadDeployer(): Promise<Ed25519Keypair | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("gas_reserve").select("secret_ciphertext").maybeSingle();
    const ciphertext = (data as { secret_ciphertext?: string } | null)?.secret_ciphertext;
    if (ciphertext) return Ed25519Keypair.fromSecretKey(decryptConnectionKey(ciphertext));
  } catch {
    // Fall through to the configured bot key.
  }
  const raw = process.env['OURBLASTBOT_SUI_SECRET_KEY'];
  if (!raw) return null;
  try {
    return Ed25519Keypair.fromSecretKey(raw.trim());
  } catch {
    return null;
  }
}

export async function deployerAddress(): Promise<string | null> {
  const keypair = await loadDeployer();
  return keypair ? keypair.getPublicKey().toSuiAddress() : null;
}

interface OwnedObject {
  objectId: string;
  version: string;
  digest: string;
  type: string;
}

/**
 * Owned-object reads through Sui JSON-RPC mirrors. The official GraphQL
 * service's owned-object index can lag badly (it reported zero objects for a
 * wallet that demonstrably holds coins), so these mirrors are the source of
 * truth for anything we intend to sign over.
 */
const RPC_MIRRORS = ["https://sui-rpc.publicnode.com", "https://rpc-mainnet.suiscan.xyz"];

export async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let lastError: Error | null = null;
  for (const url of RPC_MIRRORS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const json = (await res.json()) as { result?: T; error?: { message: string } };
      if (json.error) throw new Error(json.error.message);
      if (json.result === undefined) throw new Error("Sui read failed.");
      return json.result;
    } catch (error) {
      lastError = error as Error;
    }
  }
  throw lastError ?? new Error("Sui read failed.");
}

async function listOwnedViaGraphql(address: string, typeFilter: string): Promise<OwnedObject[]> {
  const data = await gql<{
    address: {
      objects: {
        nodes: { address: string; version: number; digest: string; contents: { type: { repr: string } } | null }[];
      };
    } | null;
  }>(
    `query($a:SuiAddress!,$t:String){address(address:$a){objects(first:50,filter:{type:$t}){nodes{address version digest contents{type{repr}}}}}}`,
    { a: address, t: typeFilter },
  );
  return (data.address?.objects.nodes ?? []).map((node) => ({
    objectId: node.address,
    version: String(node.version),
    digest: node.digest,
    type: node.contents?.type.repr ?? "",
  }));
}

async function listOwned(address: string, typeFilter: string): Promise<OwnedObject[]> {
  try {
    const nodes = await rpc<{
      data: { data: { objectId: string; version: string; digest: string; type?: string } | null }[];
    }>("suix_getOwnedObjects", [
      address,
      { filter: { StructType: typeFilter }, options: { showType: true } },
      null,
      50,
    ]);
    const owned = (nodes.data ?? [])
      .map((entry) => entry.data)
      .filter((entry): entry is { objectId: string; version: string; digest: string; type?: string } => !!entry)
      .map((entry) => ({
        objectId: entry.objectId,
        version: String(entry.version),
        digest: entry.digest,
        type: entry.type ?? "",
      }));
    if (owned.length > 0) return owned;
  } catch {
    // Mirrors unreachable: fall back to the GraphQL index below.
  }
  return listOwnedViaGraphql(address, typeFilter).catch(() => []);
}

function genericOf(type: string): string | null {
  const open = type.indexOf("<");
  if (open < 0 || !type.endsWith(">")) return null;
  return type.slice(open + 1, -1);
}

async function suiBalanceMist(address: string): Promise<number> {
  try {
    const data = await gql<{ address: { balance: { totalBalance: string } | null } | null }>(
      `query($a:SuiAddress!){address(address:$a){balance(coinType:"0x2::sui::SUI"){totalBalance}}}`,
      { a: address },
    );
    return Number(data.address?.balance?.totalBalance ?? 0);
  } catch {
    return 0;
  }
}

/** What an operator needs to see in the admin panel, and nothing more. */
export async function readDeployerStatus(): Promise<SuipumpDeployerStatus> {
  const config = readSuipumpConfig();
  const address = await deployerAddress();
  const missing: string[] = [];
  if (!address) missing.push("The OurBlastBot wallet is not configured.");
  if (!config.issuerKey) missing.push("The Suipump launch-pass key is not set (SUIPUMP_ISSUER_KEY).");
  if (!config.enabled) missing.push("Real launching is switched off (SUIPUMP_LAUNCH_ENABLED).");

  const requiredMist = config.launchFeeMist + GAS_HEADROOM_MIST;
  let balanceMist = 0;
  if (address) {
    balanceMist = await suiBalanceMist(address);
    if (balanceMist < requiredMist) {
      missing.push(
        `The wallet needs about ${(requiredMist / MIST_PER_SUI).toFixed(2)} SUI to launch; it holds ${(balanceMist / MIST_PER_SUI).toFixed(3)}.`,
      );
    }
  }

  return {
    deployerAddress: address,
    packageId: config.packageId,
    registryConfigured: Boolean(config.registryId),
    issuerConfigured: Boolean(config.issuerKey),
    enabled: config.enabled,
    balanceSui: balanceMist / MIST_PER_SUI,
    requiredSui: requiredMist / MIST_PER_SUI,
    ready: missing.length === 0,
    missing,
  };
}

interface SharedRef {
  objectId: string;
  initialSharedVersion: string;
}

async function sharedRef(objectId: string): Promise<SharedRef> {
  const data = await gql<{ object: { owner: { initialSharedVersion?: number } | null } | null }>(
    `query($id:SuiAddress!){object(address:$id){owner{__typename ... on Shared{initialSharedVersion}}}}`,
    { id: objectId },
  );
  const initial = data.object?.owner?.initialSharedVersion;
  if (initial === undefined || initial === null) throw new Error("That Suipump object is not shared.");
  return { objectId, initialSharedVersion: String(initial) };
}

async function referenceGasPrice(): Promise<number> {
  const data = await gql<{ epoch: { referenceGasPrice: string } | null }>(`query{epoch{referenceGasPrice}}`);
  return Number(data.epoch?.referenceGasPrice ?? 1000);
}

interface ExecutedTransaction {
  digest: string | null;
  ok: boolean;
  error: string | null;
  created: { address: string; type: string }[];
}

/** Simulates, then submits. A rejected simulation never reaches the network. */
async function signAndExecute(
  tx: Transaction,
  keypair: Ed25519Keypair,
): Promise<ExecutedTransaction> {
  let bytes: Uint8Array;
  try {
    bytes = await tx.build();
  } catch (error) {
    return { digest: null, ok: false, error: `prepare failed: ${(error as Error).message}`, created: [] };
  }
  const txBase64 = Buffer.from(bytes).toString("base64");

  const simulated = await gql<{
    simulateTransaction: { effects: { status: string; executionError: { message: string } | null } | null } | null;
  }>(
    `query($tx:Base64!){simulateTransaction(transactionDataBcs:$tx){effects{status executionError{message}}}}`,
    { tx: txBase64 },
  ).catch(() => null);
  const simStatus = simulated?.simulateTransaction?.effects?.status;
  if (simStatus && simStatus !== "SUCCESS") {
    return {
      digest: null,
      ok: false,
      error: `simulation rejected: ${simulated?.simulateTransaction?.effects?.executionError?.message ?? "unknown"}`,
      created: [],
    };
  }

  const { signature } = await keypair.signTransaction(bytes);
  const executed = await gql<{
    executeTransaction: {
      effects: {
        digest: string;
        status: string;
        executionError: { message: string } | null;
        objectChanges: {
          nodes: {
            idCreated: boolean;
            address: string;
            outputState: { asMoveObject: { contents: { type: { repr: string } } | null } | null } | null;
          }[];
        } | null;
      } | null;
    } | null;
  }>(
    `mutation($tx:Base64!,$sigs:[String!]!){executeTransaction(transactionDataBcs:$tx,signatures:$sigs){effects{digest status executionError{message} objectChanges(first:50){nodes{idCreated address outputState{asMoveObject{contents{type{repr}}}}}}}}}`,
    { tx: txBase64, sigs: [signature] },
  ).catch((error: Error) => {
    console.error("suipump execute failed", error.message);
    return null;
  });

  const effects = executed?.executeTransaction?.effects;
  if (!effects || effects.status !== "SUCCESS") {
    return {
      digest: effects?.digest ?? null,
      ok: false,
      error: effects?.executionError?.message ?? "the transaction did not go through",
      created: [],
    };
  }
  const fromGraphql = (effects.objectChanges?.nodes ?? [])
    .filter((node) => node.idCreated)
    .map((node) => ({ address: node.address, type: normalizeType(node.outputState?.asMoveObject?.contents?.type.repr ?? "") }));
  const created = fromGraphql.some((row) => row.type) ? fromGraphql : await createdViaRpc(effects.digest);
  return { digest: effects.digest, ok: true, error: null, created };
}

/** Collapses padded addresses ("0x000…02::coin::Coin") to their short form. */
function normalizeType(type: string): string {
  return type.replace(/0x0+([0-9a-f])/g, "0x$1");
}

/** Created objects read back from the transaction itself, for indexes GraphQL misses. */
async function createdViaRpc(digest: string): Promise<{ address: string; type: string }[]> {
  try {
    const block = await rpc<{ objectChanges?: { type: string; objectId?: string; objectType?: string }[] }>(
      "sui_getTransactionBlock",
      [digest, { showObjectChanges: true }],
    );
    return (block.objectChanges ?? [])
      .filter((change) => change.type === "created" && change.objectId && change.objectType)
      .map((change) => ({ address: change.objectId!, type: normalizeType(change.objectType!) }));
  } catch {
    return [];
  }
}

/**
 * Owned SUI coins, largest first, for explicit gas payment. Read through the
 * dedicated coin index (suix_getCoins), which stays accurate even when the
 * generic owned-object indexes lag behind.
 */
async function gasCoins(address: string): Promise<OwnedObject[]> {
  try {
    const result = await rpc<{
      data: { coinObjectId: string; version: string; digest: string; balance: string }[];
    }>("suix_getCoins", [address, "0x2::sui::SUI", null, 50]);
    const coins = (result.data ?? [])
      .slice()
      .sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)))
      .map((coin) => ({
        objectId: coin.coinObjectId,
        version: String(coin.version),
        digest: coin.digest,
        type: "0x2::coin::Coin<0x2::sui::SUI>",
      }));
    if (coins.length > 0) return coins;
  } catch {
    // Fall through to the generic owned-object lookup.
  }
  return listOwned(address, "0x2::coin::Coin<0x2::sui::SUI>");
}

function withGas(tx: Transaction, sender: string, coins: OwnedObject[], gasPrice: number, budget: number): void {
  tx.setSender(sender);
  tx.setGasPrice(gasPrice);
  tx.setGasBudget(budget);
  tx.setGasPayment(
    coins.slice(0, 8).map((coin) => ({ objectId: coin.objectId, version: coin.version, digest: coin.digest })),
  );
}

interface IssuedTicket {
  ticketId: string;
  coinType: string | null;
}

/**
 * Asks Suipump's public issuer to mint a launch ticket for a freshly published
 * package. The issuer verifies the published bytecode against the public
 * template — it is open to anyone who publishes correctly, not a whitelist.
 */
async function requestLaunchTicket(config: SuipumpLaunchConfig, packageId: string): Promise<IssuedTicket> {
  const deadline = Date.now() + 240_000;
  let lastReason = "the launch pass was not issued";
  while (Date.now() < deadline) {
    const response = await fetch(`${config.issuerUrl}/issue`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-issuer-key": config.issuerKey },
      body: JSON.stringify({ packageId }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as
      | { ok?: boolean; ticketId?: string; coinType?: string; reason?: string; message?: string }
      | null;
    if (response?.ok && body?.ok && body.ticketId) {
      return { ticketId: body.ticketId, coinType: body.coinType ?? null };
    }
    lastReason = body?.reason ?? body?.message ?? `issuer HTTP ${response?.status ?? 0}`;
    // Indexing lag and rate limits are expected; anything else is final.
    const retryable = new Set([
      "NOT_FOUND",
      "TREASURY_NOT_FOUND",
      "CHAIN_UNAVAILABLE",
      "RATE_LIMITED",
      "ISSUER_UNAVAILABLE",
      "CONFIRM_PENDING",
      "MINT_FAILED",
    ]);
    if (!retryable.has(String(body?.reason ?? "")) && response && response.status < 500) {
      throw new Error(lastReason);
    }
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  throw new Error(lastReason);
}

export interface SuipumpLaunchInput {
  symbol: string;
  name: string;
  description: string;
  iconUrl?: string | null;
  /** X profile link of the caller who asked for the launch; stored in the coin info. */
  callerXLink?: string | null;
  /** The caller's original tweet text; quoted in the coin info. */
  callerTweetText?: string | null;
  /** Fee recipients and their share in basis points; must add up to 10000. */
  payees: string[];
  shareBps: number[];
}

/** Waits for a freshly created owned object to be readable, then returns it. */
async function awaitOwned(address: string, typeFilter: string, objectId: string): Promise<OwnedObject | null> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const direct = await readObjectRef(objectId, address);
    if (direct) return direct;
    const owned = await listOwned(address, typeFilter).catch(() => []);
    const match = owned.find((row) => row.objectId === objectId);
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 2_500));
  }
  return null;
}

/** Reads one object by id and confirms the wallet still owns it. */
async function readObjectRef(objectId: string, owner: string): Promise<OwnedObject | null> {
  try {
    const result = await rpc<{
      data?: {
        objectId: string;
        version: string;
        digest: string;
        type?: string;
        owner?: { AddressOwner?: string };
      };
    }>("sui_getObject", [objectId, { showType: true, showOwner: true }]);
    const data = result.data;
    if (!data || data.owner?.AddressOwner !== owner) return null;
    return {
      objectId: data.objectId,
      version: String(data.version),
      digest: data.digest,
      type: normalizeType(data.type ?? ""),
    };
  } catch {
    return null;
  }
}

/**
 * Performs the full public Suipump launch with the OurBlastBot wallet:
 * publish → launch pass → create curve. Returns CONFIRMED only when Sui
 * confirms the curve; anything else says plainly what happened.
 */
export async function launchOnSuipump(input: SuipumpLaunchInput): Promise<SuipumpLaunchResult> {
  const config = readSuipumpConfig();
  const status = await readDeployerStatus();
  if (!status.ready) {
    return {
      status: "NOT_IMPLEMENTED",
      message: status.missing[0] ?? "Suipump launching is not available yet.",
      tokenAddress: null,
      transactionDigest: null,
    };
  }

  const keypair = await loadDeployer();
  const sender = keypair?.getPublicKey().toSuiAddress();
  if (!keypair || !sender) {
    return {
      status: "NOT_IMPLEMENTED",
      message: "The OurBlastBot wallet is not configured.",
      tokenAddress: null,
      transactionDigest: null,
    };
  }

  const symbol = input.symbol.slice(0, 10).toUpperCase();
  const name = input.name.slice(0, 64) || symbol;
  // The template has no dedicated social field, so the caller's X link rides in
  // the coin description, where every explorer and suipump.org show it.
  const baseDescription = input.description.trim();
  const withCaller = input.callerXLink?.trim()
    ? `${baseDescription ? `${baseDescription} ` : ""}Called by ${input.callerXLink.trim()} via @Ourblastbot`
    : baseDescription;
  // Quote the caller's own tweet in the coin info so explorers show the original call.
  const tweet = input.callerTweetText?.replace(/\s+/g, " ").trim();
  const withTweet = tweet ? `${withCaller ? `${withCaller} ` : ""}"${tweet}"` : withCaller;
  const description = withTweet.slice(0, 200);

  // 1. Publish the coin package from Suipump's public template.
  let coinModule: Uint8Array;
  try {
    const template = await fetchCoinTemplate(config.templateUrl);
    coinModule = patchCoinTemplate(template, {
      symbol,
      name,
      description,
      iconUrl: input.iconUrl?.trim() || "https://ourblast.xyz/icon-192.png",
      decimals: config.decimals,
    });
  } catch (error) {
    console.error("suipump template patch failed", (error as Error).message);
    return { status: "FAILED", message: "The coin could not be prepared.", tokenAddress: null, transactionDigest: null };
  }

  const gasPrice = await referenceGasPrice();
  const publishCoins = await gasCoins(sender);
  if (publishCoins.length === 0) {
    return { status: "FAILED", message: "The launch wallet has no SUI to pay gas.", tokenAddress: null, transactionDigest: null };
  }

  const publishTx = new Transaction();
  withGas(publishTx, sender, publishCoins, gasPrice, PUBLISH_GAS_BUDGET_MIST);
  const upgradeCap = publishTx.publish({
    modules: [Buffer.from(coinModule).toString("base64")],
    dependencies: [
      "0x0000000000000000000000000000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000000000000000000000000000002",
    ],
  });
  // Immutable package, exactly like a suipump.org launch: nobody can upgrade the coin.
  publishTx.moveCall({ target: "0x2::package::make_immutable", arguments: [upgradeCap] });

  const published = await signAndExecute(publishTx, keypair);
  if (!published.ok) {
    console.error("suipump publish failed", published.error);
    return { status: "FAILED", message: "The coin could not be published on Sui.", tokenAddress: null, transactionDigest: published.digest };
  }

  const capRow = published.created.find((row) => row.type.startsWith("0x2::coin::TreasuryCap<"));
  const coinType = capRow ? genericOf(capRow.type) : null;
  if (!capRow || !coinType) {
    return {
      status: "FAILED",
      message: "The coin was published but its treasury could not be identified.",
      tokenAddress: null,
      transactionDigest: published.digest,
    };
  }
  const packageId = coinType.split("::")[0]!;

  // 2. Public launch pass for the package we just published.
  let ticketId: string;
  try {
    ticketId = (await requestLaunchTicket(config, packageId)).ticketId;
  } catch (error) {
    console.error("suipump ticket failed", (error as Error).message);
    return {
      status: "FAILED",
      message: "Suipump did not issue a launch pass for this coin, so nothing was launched.",
      tokenAddress: null,
      transactionDigest: published.digest,
      coinType,
    };
  }

  // 3. Create the bonding curve.
  const ticketType = `${config.packageId}::${SUIPUMP_MODULE}::${SUIPUMP_TICKET_TYPE}<${coinType}>`;
  const [ticket, cap] = await Promise.all([
    awaitOwned(sender, ticketType, ticketId),
    awaitOwned(sender, `0x2::coin::TreasuryCap<${coinType}>`, capRow.address),
  ]);
  if (!ticket || !cap) {
    return {
      status: "FAILED",
      message: "The launch pass is not readable on chain yet — the coin is published and can be launched shortly.",
      tokenAddress: null,
      transactionDigest: published.digest,
      coinType,
    };
  }

  const [registry, clock, createCoins] = await Promise.all([
    sharedRef(config.registryId),
    sharedRef(CLOCK_ID),
    gasCoins(sender),
  ]);

  const tx = new Transaction();
  withGas(tx, sender, createCoins, gasPrice, CREATE_GAS_BUDGET_MIST);
  const [launchFee] = tx.splitCoins(tx.gas, [config.launchFeeMist]);
  tx.moveCall({
    target: `${config.packageId}::${SUIPUMP_MODULE}::${SUIPUMP_CREATE_FUNCTION}`,
    typeArguments: [coinType],
    arguments: [
      tx.objectRef({ objectId: ticket.objectId, version: ticket.version, digest: ticket.digest }),
      tx.sharedObjectRef({ ...registry, mutable: false }),
      tx.objectRef({ objectId: cap.objectId, version: cap.version, digest: cap.digest }),
      launchFee!,
      tx.pure.string(name),
      tx.pure.string(symbol),
      tx.pure.string(description),
      tx.pure.vector("address", input.payees),
      tx.pure.vector("u64", input.shareBps.map((bps) => BigInt(bps))),
      tx.pure.u8(config.optionA),
      tx.pure.u8(config.optionB),
      tx.sharedObjectRef({ ...clock, mutable: false }),
    ],
  });

  const created = await signAndExecute(tx, keypair);
  if (!created.ok) {
    console.error("suipump create failed", created.error);
    return {
      status: "FAILED",
      message: "Suipump rejected the launch, so no token was created.",
      tokenAddress: null,
      transactionDigest: created.digest,
      coinType,
    };
  }

  const curve = created.created.find((row) => row.type.includes(`${SUIPUMP_MODULE}::Curve<`));
  if (!curve) {
    return {
      status: "FAILED",
      message: "The launch was sent but its token could not be confirmed yet.",
      tokenAddress: null,
      transactionDigest: created.digest,
      coinType,
    };
  }

  return {
    status: "CONFIRMED",
    message: "Launch confirmed on Sui.",
    tokenAddress: curve.address,
    transactionDigest: created.digest,
    coinType,
  };
}
