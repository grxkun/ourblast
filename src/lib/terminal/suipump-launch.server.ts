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
  SUIPUMP_SHARE_FUNCTION,
  SUIPUMP_TEMPLATE_URL_DEFAULT,
  SUIPUMP_TICKET_TYPE,
  type SuipumpDeployerStatus,
  type SuipumpLaunchConfig,
  type SuipumpLaunchResult,
} from "./suipump-launch";
import { escrowCreatorSui, refundCreatorSui, type DevBuySigner, type OwnedSuiCoin } from "./devbuy-sui.server";

/** The shared PriceConfig id the Suipump registry points buys at. */
async function readRegistryPriceConfig(registryId: string): Promise<string | null> {
  const obj = await rpc<{ data?: { content?: { fields?: Record<string, unknown> } } }>("sui_getObject", [
    registryId,
    { showContent: true },
  ]).catch(() => null);
  const id = obj?.data?.content?.fields?.["price_config_id"];
  return typeof id === "string" && id ? id : null;
}

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
const COIN_REGISTRY_ID = "0x000000000000000000000000000000000000000000000000000000000000000c";
const PUBLISH_GAS_BUDGET_MIST = 500_000_000; // 0.5 SUI ceiling for the coin publish.
const CREATE_GAS_BUDGET_MIST = 300_000_000; // 0.3 SUI ceiling for the create call.
const GAS_HEADROOM_MIST = 900_000_000; // Publish + create gas we insist on having.

/**
 * Every network call gets a hard time limit. Without one, a single unresponsive
 * Sui node leaves a launch hanging forever with the request stuck "launching".
 */
const NETWORK_TIMEOUT_MS = 30_000;
const SUBMIT_TIMEOUT_MS = 45_000;

export async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(GRAPHQL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
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
    optionB: Math.min(255, Math.max(0, Math.round(numberEnv("SUIPUMP_CREATE_OPTION_B", 0)))),
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

export interface OwnedObject {
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
const RPC_MIRRORS = [
  "https://sui-rpc.publicnode.com",
  "https://rpc-mainnet.suiscan.xyz",
  "https://sui-mainnet.nodeinfra.com",
  "https://sui-mainnet-endpoint.blockvision.org",
  "https://mainnet.sui.rpcpool.com",
];

export async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let lastError: Error | null = null;
  for (const url of RPC_MIRRORS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
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

/**
 * Initial shared version of a shared object. Read through GraphQL first, with a
 * JSON-RPC fallback: a single flaky read used to abort an entire launch.
 */
export async function sharedRef(objectId: string): Promise<SharedRef> {
  const viaGraphql = await gql<{ object: { owner: { initialSharedVersion?: number } | null } | null }>(
    `query($id:SuiAddress!){object(address:$id){owner{__typename ... on Shared{initialSharedVersion}}}}`,
    { id: objectId },
  )
    .then((data) => data.object?.owner?.initialSharedVersion ?? null)
    .catch(() => null);
  if (viaGraphql !== null) return { objectId, initialSharedVersion: String(viaGraphql) };

  const viaRpc = await rpc<{
    data?: { owner?: { Shared?: { initial_shared_version: number } } | string };
  }>("sui_getObject", [objectId, { showOwner: true }])
    .then((result) => {
      const owner = result.data?.owner;
      return typeof owner === "string" ? null : (owner?.Shared?.initial_shared_version ?? null);
    })
    .catch(() => null);
  if (viaRpc !== null) return { objectId, initialSharedVersion: String(viaRpc) };
  throw new Error(`The on-chain object ${objectId.slice(0, 10)}… could not be read as a shared object.`);
}

export async function referenceGasPrice(): Promise<number> {
  const data = await gql<{ epoch: { referenceGasPrice: string } | null }>(`query{epoch{referenceGasPrice}}`);
  return Number(data.epoch?.referenceGasPrice ?? 1000);
}

export interface ExecutedTransaction {
  digest: string | null;
  ok: boolean;
  error: string | null;
  created: { address: string; type: string }[];
}

/** Polls for a known digest, for submissions whose response never arrived. */
async function waitForDigest(digest: string): Promise<boolean> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const block = await rpc<{ effects?: { status?: { status?: string } } }>("sui_getTransactionBlock", [
      digest,
      { showEffects: true },
    ]).catch(() => null);
    const status = block?.effects?.status?.status;
    if (status === "success") return true;
    if (status) return false;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return false;
}

/** Anything that can sign Sui transaction bytes — a local keypair or a Turnkey enclave key. */
export interface TxSigner {
  signTransaction(bytes: Uint8Array): Promise<{ signature: string }>;
}

/**
 * Simulates, then submits. A rejected simulation never reaches the network.
 * `sponsor` is the gas owner's signer for a sponsored transaction: Sui requires
 * both the sender's and the gas owner's signature over the same bytes.
 */
export async function signAndExecute(
  tx: Transaction,
  keypair: TxSigner,
  sponsor?: TxSigner | null,
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
  const signatures = [signature];
  if (sponsor) signatures.push((await sponsor.signTransaction(bytes)).signature);
  if (process.env['OB_TX_DUMP']) {
    const fs = await import("node:fs/promises");
    await fs.writeFile(process.env['OB_TX_DUMP']!, JSON.stringify({ txBase64, signature })).catch(() => undefined);
  }
  // The digest is known before submission, so a timed-out or dropped response
  // never loses a transaction that the network actually accepted.
  const expectedDigest = await tx.getDigest().catch(() => null);

  // Submission goes through the JSON-RPC mirrors first: the GraphQL submit
  // endpoint times out on large transactions such as the pool creation.
  let lastSubmitError: string | null = null;
  for (const url of RPC_MIRRORS) {
    const submitted = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sui_executeTransactionBlock",
        params: [txBase64, signatures, { showEffects: true }, "WaitForEffectsCert"],
      }),
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    })
      .then((res) => res.text())
      .then((text) => {
        try {
          return JSON.parse(text) as {
            result?: { digest?: string; effects?: { status?: { status?: string; error?: string } } };
            error?: { message: string };
          };
        } catch {
          throw new Error(text.slice(0, 200));
        }
      })
      .catch((error: Error) => {
        console.error("submit via", url, "failed:", error.message);
        return null;
      });
    if (submitted?.error) {
      lastSubmitError = submitted.error.message;
      console.error("submit via", url, "rejected:", JSON.stringify(submitted.error).slice(0, 600));
      continue;
    }
    const status = submitted?.result?.effects?.status?.status;
    const digest = submitted?.result?.digest ?? expectedDigest;
    if (status === "success" && digest) {
      return { digest, ok: true, error: null, created: await createdViaRpc(digest) };
    }
    if (status) {
      return {
        digest: digest ?? null,
        ok: false,
        error: submitted?.result?.effects?.status?.error ?? "the transaction failed on chain",
        created: [],
      };
    }
  }
  if (expectedDigest && (await waitForDigest(expectedDigest))) {
    return { digest: expectedDigest, ok: true, error: null, created: await createdViaRpc(expectedDigest) };
  }

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
    { tx: txBase64, sigs: signatures },
  ).catch((error: Error) => {
    console.error("suipump execute failed", error.message);
    console.error("failed tx data", JSON.stringify(tx.getData(), (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ));
    return null;
  });

  const effects = executed?.executeTransaction?.effects;
  if (!effects && expectedDigest) {
    // No usable answer from the submit call: it may have landed anyway, and if
    // it did not, resubmit the same signed bytes through a JSON-RPC mirror.
    if (await waitForDigest(expectedDigest)) {
      return { digest: expectedDigest, ok: true, error: null, created: await createdViaRpc(expectedDigest) };
    }
    const viaRpc = await rpc<{ digest?: string; effects?: { status?: { status?: string; error?: string } } }>(
      "sui_executeTransactionBlock",
      [txBase64, signatures, { showEffects: true }, "WaitForEffectsCert"],
    ).catch((error: Error) => {
      console.error("mirror execute failed", error.message);
      return null;
    });
    const rpcStatus = viaRpc?.effects?.status?.status;
    if (rpcStatus === "success") {
      const digest = viaRpc?.digest ?? expectedDigest;
      return { digest, ok: true, error: null, created: await createdViaRpc(digest) };
    }
    if (rpcStatus) {
      return { digest: viaRpc?.digest ?? null, ok: false, error: viaRpc?.effects?.status?.error ?? "the transaction failed on chain", created: [] };
    }
    if (await waitForDigest(expectedDigest)) {
      return { digest: expectedDigest, ok: true, error: null, created: await createdViaRpc(expectedDigest) };
    }
  }
  if (!effects || effects.status !== "SUCCESS") {
    return {
      digest: effects?.digest ?? null,
      ok: false,
      error: effects?.executionError?.message ?? lastSubmitError ?? "the transaction did not go through",
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
export function normalizeType(type: string): string {
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
export async function gasCoins(address: string): Promise<OwnedObject[]> {
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

export function withGas(tx: Transaction, sender: string, coins: OwnedObject[], gasPrice: number, budget: number): void {
  tx.setSender(sender);
  tx.setGasPrice(gasPrice);
  tx.setGasBudget(budget);
  tx.setGasPayment(
    coins.slice(0, 8).map((coin) => ({ objectId: coin.objectId, version: coin.version, digest: coin.digest })),
  );
}

/**
 * Sponsored gas: `sender` owns the objects the transaction touches, while
 * `sponsor` owns the gas coins and pays the fee. Both must sign the built bytes
 * (see signAndExecute's `sponsor` argument).
 */
export function withSponsoredGas(
  tx: Transaction,
  sender: string,
  sponsor: string,
  sponsorCoins: OwnedObject[],
  gasPrice: number,
  budget: number,
): void {
  tx.setSender(sender);
  tx.setGasOwner(sponsor);
  tx.setGasPrice(gasPrice);
  tx.setGasBudget(budget);
  tx.setGasPayment(
    sponsorCoins
      .slice(0, 8)
      .map((coin) => ({ objectId: coin.objectId, version: coin.version, digest: coin.digest })),
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
  /** Creator's opening buy in SUI; bought on the curve before it is shared. */
  devBuySui?: number | null;
  /** Creator OurBank wallet that funds the buy and receives the tokens. */
  devBuyer?: DevBuySigner | null;
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

/** Reads one object's owner and builds the matching transaction argument. */
async function objectArg(tx: Transaction, objectId: string, mutableIfShared: boolean) {
  const data = await rpc<{
    data?: {
      version: string;
      digest: string;
      owner?: { AddressOwner?: string; Shared?: { initial_shared_version: number } } | string;
    };
  }>("sui_getObject", [objectId, { showOwner: true }]).catch(() => null);
  const obj = data?.data;
  if (!obj || typeof obj.owner === "string" || !obj.owner) return null;
  if (obj.owner.Shared) {
    return tx.sharedObjectRef({
      objectId,
      initialSharedVersion: String(obj.owner.Shared.initial_shared_version),
      mutable: mutableIfShared,
    });
  }
  return tx.objectRef({ objectId, version: String(obj.version), digest: obj.digest });
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

  // 3. Create the bonding curve: migrate the coin's metadata into Sui's coin
  // registry (as the suipump.org client does), then create_and_return +
  // share_curve — the two-step flow their 2026-09-21 package upgrade requires.
  const ticketType = `${config.packageId}::${SUIPUMP_MODULE}::${SUIPUMP_TICKET_TYPE}<${coinType}>`;
  const metadataRow = published.created.find((row) => row.type.startsWith("0x2::coin::CoinMetadata<"));
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

  // Creator first buy: the creator's own SUI is moved to the bot first, then
  // spent on the still-unshared curve inside the create transaction, so no
  // sniper can trade before it.
  let devBuyError: string | null = null;
  let escrow: OwnedSuiCoin | null = null;
  const devBuyMist = input.devBuySui && input.devBuySui > 0 ? BigInt(Math.round(input.devBuySui * 1e9)) : 0n;
  if (devBuyMist > 0n) {
    if (!input.devBuyer) {
      devBuyError = "First buy skipped: no OurBank wallet is linked to the launcher.";
    } else {
      const moved = await escrowCreatorSui({ buyer: input.devBuyer, bot: sender, amountMist: devBuyMist, gasPrice });
      escrow = moved.coin;
      if (!escrow) devBuyError = `First buy skipped: ${moved.error ?? "the SUI could not be moved"}`;
    }
  }
  const refundEscrow = async (): Promise<string> => {
    if (!escrow || !input.devBuyer) return "";
    const refundError = await refundCreatorSui({ keypair, bot: sender, coin: escrow, to: input.devBuyer.address, gasPrice });
    return refundError ? ` ${refundError}` : " The first-buy SUI was returned to the creator.";
  };

  const [registry, clock, allCoins] = await Promise.all([
    sharedRef(config.registryId),
    sharedRef(CLOCK_ID),
    gasCoins(sender),
  ]);
  // The escrowed first-buy coin is spent in the buy; never also use it as gas.
  const createCoins = allCoins.filter((coin) => coin.objectId !== escrow?.coinObjectId);

  // Pay the launch fee from a separate Coin<SUI> object when the wallet holds
  // more than one; with a single coin that coin must stay the gas payment, so
  // the fee is split out of the gas coin instead (an empty gas payment makes
  // the transaction impossible to build).
  if (createCoins.length === 0) {
    return {
      status: "FAILED",
      message:
        "The bot wallet has no SUI coin to pay gas with. Send a few SUI to it with a normal transfer, then launch again." +
        (await refundEscrow()),
      tokenAddress: null,
      transactionDigest: null,
      coinType,
    };
  }
  const feeCoin = config.launchFeeMist > 0 && createCoins.length > 1 ? createCoins[0] : null;
  const tx = new Transaction();
  withGas(tx, sender, feeCoin ? createCoins.slice(1) : createCoins, gasPrice, CREATE_GAS_BUDGET_MIST);
  const [launchFee] = feeCoin
    ? tx.splitCoins(tx.objectRef({ objectId: feeCoin.objectId, version: feeCoin.version, digest: feeCoin.digest }), [
        config.launchFeeMist,
      ])
    : tx.splitCoins(tx.gas, [config.launchFeeMist > 0 ? BigInt(config.launchFeeMist) : 0n]);

  // Move the coin's metadata into Sui's coin registry first, exactly like the
  // suipump.org client; skip only if this template created no legacy metadata.
  if (metadataRow) {
    const registryArg = await objectArg(tx, COIN_REGISTRY_ID, true);
    const metadataArg = await objectArg(tx, metadataRow.address, false);
    if (registryArg && metadataArg) {
      tx.moveCall({
        target: "0x2::coin_registry::migrate_legacy_metadata",
        typeArguments: [coinType],
        arguments: [registryArg, metadataArg],
      });
    }
  }

  const createResult = tx.moveCall({
    target: `${config.packageId}::${SUIPUMP_MODULE}::${SUIPUMP_CREATE_FUNCTION}`,
    typeArguments: [coinType],
    // Order is the on-chain signature of create_and_return in the V17 package:
    // (LaunchTicket, &LaunchIssuerRegistry, TreasuryCap, Coin<SUI>, name,
    // symbol, description, payees, shares, optionA, optionB, &Clock).
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
  // create_and_return yields (curve, creator_cap); share the curve and keep
  // the creator cap with the launch wallet.
  const curveArg = createResult[0];
  const creatorCap = createResult[1];
  if (!curveArg || !creatorCap) {
    return {
      status: "FAILED",
      message: "The launch transaction could not be prepared." + (await refundEscrow()),
      tokenAddress: null,
      transactionDigest: published.digest,
      coinType,
    };
  }
  // Anti-sniper first buy: the curve is still owned by this transaction, so
  // the creator's buy lands before anyone else can see the pool.
  if (escrow && input.devBuyer) {
    const priceConfigId = await readRegistryPriceConfig(config.registryId);
    if (!priceConfigId) {
      devBuyError = "First buy skipped: Suipump's price config could not be read." + (await refundEscrow());
      escrow = null;
    } else {
      const priceConfig = await sharedRef(priceConfigId);
      const bought = tx.moveCall({
        target: `${config.packageId}::${SUIPUMP_MODULE}::buy`,
        typeArguments: [coinType],
        arguments: [
          curveArg,
          tx.objectRef({ objectId: escrow.coinObjectId, version: escrow.version, digest: escrow.digest }),
          tx.pure.u64(0n),
          tx.pure.option("address", null),
          tx.sharedObjectRef({ ...priceConfig, mutable: false }),
          tx.sharedObjectRef({ ...clock, mutable: false }),
        ],
      });
      tx.transferObjects([bought[0]!, bought[1]!], input.devBuyer.address);
    }
  }
  tx.moveCall({
    target: `${config.packageId}::${SUIPUMP_MODULE}::${SUIPUMP_SHARE_FUNCTION}`,
    typeArguments: [coinType],
    arguments: [curveArg],
  });
  tx.transferObjects([creatorCap], sender);

  const created = await signAndExecute(tx, keypair);
  if (!created.ok) {
    console.error("suipump create failed", created.error);
    return {
      status: "FAILED",
      message: "Suipump rejected the launch, so no token was created." + (await refundEscrow()),
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
    devBuyError,
  };
}
