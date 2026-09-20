import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

import { decryptConnectionKey } from "@/lib/connection-key.server";
import { MIST_PER_SUI } from "@/lib/ourblast.config";
import {
  SUIPUMP_CREATE_FUNCTION,
  SUIPUMP_MODULE,
  SUIPUMP_PACKAGE_DEFAULT,
  SUIPUMP_TICKET_TYPE,
  type SuipumpDeployerStatus,
  type SuipumpLaunchConfig,
  type SuipumpLaunchResult,
} from "./suipump-launch";

/**
 * Real Suipump launch adapter. Public JSON-RPC fullnodes are retired, so every
 * read and the submission itself go through the Sui GraphQL service.
 *
 * The whole file is inert until the deployer wallet holds a launch ticket:
 * `readDeployerStatus()` reports exactly what is missing and `launchOnSuipump`
 * refuses with NOT_IMPLEMENTED rather than pretending anything happened.
 */

const GRAPHQL = "https://graphql.mainnet.sui.io/graphql";
const CLOCK_ID = "0x0000000000000000000000000000000000000000000000000000000000000006";
const GAS_BUDGET_MIST = 200_000_000; // 0.2 SUI ceiling for a create call.

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
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

/** Operator-configurable settings; all optional except the registry id. */
export function readSuipumpConfig(): SuipumpLaunchConfig {
  return {
    packageId: process.env['SUIPUMP_PACKAGE_ID']?.trim() || SUIPUMP_PACKAGE_DEFAULT,
    registryId: process.env['SUIPUMP_LAUNCH_REGISTRY_ID']?.trim() || null,
    launchFeeMist: Math.max(0, Math.round(numberEnv("SUIPUMP_LAUNCH_FEE_SUI", 0) * MIST_PER_SUI)),
    optionA: Math.min(255, Math.max(0, Math.round(numberEnv("SUIPUMP_CREATE_OPTION_A", 0)))),
    optionB: Math.min(255, Math.max(0, Math.round(numberEnv("SUIPUMP_CREATE_OPTION_B", 0)))),
    enabled: (process.env['SUIPUMP_LAUNCH_ENABLED'] ?? "").trim().toLowerCase() === "true",
  };
}

/**
 * Loads the OurBlastBot signer. The key comes from the encrypted gas-reserve
 * row (or the backend secret) and never leaves this module.
 */
async function loadDeployer(): Promise<Ed25519Keypair | null> {
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

async function listOwned(address: string, typeFilter: string): Promise<OwnedObject[]> {
  const data = await gql<{
    address: { objects: { nodes: { address: string; version: number; digest: string; contents: { type: { repr: string } } | null }[] } } | null;
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

function genericOf(type: string): string | null {
  const open = type.indexOf("<");
  if (open < 0 || !type.endsWith(">")) return null;
  return type.slice(open + 1, -1);
}

async function suiBalanceMist(address: string): Promise<number> {
  try {
    const data = await gql<{ address: { balance: { totalBalance: string } | null } | null }>(
      `query($a:SuiAddress!){address(address:$a){balance(type:"0x2::sui::SUI"){totalBalance}}}`,
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
  if (!config.registryId) missing.push("Suipump launch registry id is not set.");

  let tickets: OwnedObject[] = [];
  let caps: OwnedObject[] = [];
  let balanceMist = 0;
  if (address) {
    balanceMist = await suiBalanceMist(address);
    try {
      [tickets, caps] = await Promise.all([
        listOwned(address, `${config.packageId}::${SUIPUMP_MODULE}::${SUIPUMP_TICKET_TYPE}`),
        listOwned(address, "0x2::coin::TreasuryCap"),
      ]);
    } catch {
      missing.push("Sui could not be reached to read the wallet.");
    }
  }

  const capTypes = new Set(caps.map((cap) => genericOf(cap.type)).filter(Boolean) as string[]);
  const launchableTypes = tickets
    .map((ticket) => genericOf(ticket.type))
    .filter((type): type is string => type !== null && capTypes.has(type));

  if (address && tickets.length === 0) missing.push("Suipump has not issued a launch ticket to this wallet yet.");
  if (address && tickets.length > 0 && launchableTypes.length === 0)
    missing.push("A launch ticket is held but its coin treasury cap is missing.");
  if (address && balanceMist < 100_000_000) missing.push("The wallet needs a little SUI for gas.");
  if (!config.enabled) missing.push("Real launching is switched off (SUIPUMP_LAUNCH_ENABLED).");

  return {
    deployerAddress: address,
    packageId: config.packageId,
    registryConfigured: Boolean(config.registryId),
    enabled: config.enabled,
    tickets: tickets.length,
    treasuryCaps: caps.length,
    launchableTypes,
    balanceSui: balanceMist / MIST_PER_SUI,
    ready: missing.length === 0,
    missing,
  };
}

interface SharedRef {
  objectId: string;
  initialSharedVersion: string;
}

async function sharedRef(objectId: string): Promise<SharedRef> {
  const data = await gql<{
    object: { owner: { initialSharedVersion?: number } | null } | null;
  }>(
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

export interface SuipumpLaunchInput {
  symbol: string;
  name: string;
  description: string;
  /** Fee recipients and their share in basis points; must add up to 10000. */
  payees: string[];
  shareBps: number[];
}

/**
 * Signs and submits the real create call with the OurBlastBot wallet.
 * Simulated first: if Sui would reject it, nothing is submitted and nothing is
 * ever reported as deployed.
 */
export async function launchOnSuipump(input: SuipumpLaunchInput): Promise<SuipumpLaunchResult> {
  const config = readSuipumpConfig();
  const status = await readDeployerStatus();
  if (!status.ready || !config.registryId) {
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
    return { status: "NOT_IMPLEMENTED", message: "The OurBlastBot wallet is not configured.", tokenAddress: null, transactionDigest: null };
  }

  const coinType = status.launchableTypes[0]!;
  const [tickets, caps, gasCoins, registry, clock, gasPrice] = await Promise.all([
    listOwned(sender, `${config.packageId}::${SUIPUMP_MODULE}::${SUIPUMP_TICKET_TYPE}`),
    listOwned(sender, "0x2::coin::TreasuryCap"),
    listOwned(sender, "0x2::coin::Coin<0x2::sui::SUI>"),
    sharedRef(config.registryId),
    sharedRef(CLOCK_ID),
    referenceGasPrice(),
  ]);

  const ticket = tickets.find((row) => genericOf(row.type) === coinType);
  const cap = caps.find((row) => genericOf(row.type) === coinType);
  if (!ticket || !cap || gasCoins.length === 0) {
    return { status: "NOT_IMPLEMENTED", message: "The launch ticket, treasury cap or gas coin is missing.", tokenAddress: null, transactionDigest: null };
  }

  const tx = new Transaction();
  tx.setSender(sender);
  tx.setGasPrice(gasPrice);
  tx.setGasBudget(GAS_BUDGET_MIST);
  tx.setGasPayment(gasCoins.slice(0, 8).map((coin) => ({ objectId: coin.objectId, version: coin.version, digest: coin.digest })));

  const [launchFee] = tx.splitCoins(tx.gas, [config.launchFeeMist]);
  tx.moveCall({
    target: `${config.packageId}::${SUIPUMP_MODULE}::${SUIPUMP_CREATE_FUNCTION}`,
    typeArguments: [coinType],
    arguments: [
      tx.objectRef({ objectId: ticket.objectId, version: ticket.version, digest: ticket.digest }),
      tx.sharedObjectRef({ ...registry, mutable: false }),
      tx.objectRef({ objectId: cap.objectId, version: cap.version, digest: cap.digest }),
      launchFee!,
      tx.pure.string(input.name.slice(0, 64)),
      tx.pure.string(input.symbol.slice(0, 10).toUpperCase()),
      tx.pure.string(input.description.slice(0, 200)),
      tx.pure.vector("address", input.payees),
      tx.pure.vector("u64", input.shareBps.map((bps) => BigInt(bps))),
      tx.pure.u8(config.optionA),
      tx.pure.u8(config.optionB),
      tx.sharedObjectRef({ ...clock, mutable: false }),
    ],
  });

  let bytes: Uint8Array;
  try {
    bytes = await tx.build();
  } catch {
    return { status: "FAILED", message: "That launch could not be prepared.", tokenAddress: null, transactionDigest: null };
  }
  const txBase64 = Buffer.from(bytes).toString("base64");

  // Dry run: a rejection here means nothing is submitted and nothing is claimed.
  const simulated = await gql<{ simulateTransaction: { effects: { status: string; executionError: { message: string } | null } | null } | null }>(
    `query($tx:Base64!){simulateTransaction(transactionDataBcs:$tx){effects{status executionError{message}}}}`,
    { tx: txBase64 },
  ).catch(() => null);
  const simStatus = simulated?.simulateTransaction?.effects?.status;
  if (simStatus && simStatus !== "SUCCESS") {
    console.error("suipump simulate failed", simulated?.simulateTransaction?.effects?.executionError?.message);
    return { status: "FAILED", message: "Suipump rejected that launch, so nothing was sent.", tokenAddress: null, transactionDigest: null };
  }

  const { signature } = await keypair.signTransaction(bytes);
  const executed = await gql<{
    executeTransaction: {
      effects: {
        digest: string;
        status: string;
        executionError: { message: string } | null;
        objectChanges: { nodes: { idCreated: boolean; address: string; outputState: { asMoveObject: { contents: { type: { repr: string } } | null } | null } | null }[] } | null;
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
    console.error("suipump execute rejected", effects?.executionError?.message);
    return { status: "FAILED", message: "That launch did not go through on Sui.", tokenAddress: null, transactionDigest: effects?.digest ?? null };
  }

  const curve = (effects.objectChanges?.nodes ?? []).find(
    (node) => node.idCreated && (node.outputState?.asMoveObject?.contents?.type.repr ?? "").includes(`${SUIPUMP_MODULE}::Curve<`),
  );
  if (!curve) {
    // Confirmed on chain but we could not identify the curve: stay honest.
    return { status: "FAILED", message: "The launch was sent but its token could not be confirmed yet.", tokenAddress: null, transactionDigest: effects.digest };
  }

  return { status: "CONFIRMED", message: "Launch confirmed on Sui.", tokenAddress: curve.address, transactionDigest: effects.digest };
}
