/**
 * OurBlast launch path for Perpsplexity (perpsplexity.app) virtual pools.
 *
 * Reproduces the official spot/bonding-curve launch exactly, traced from live
 * mainnet transactions (FLUFFY, MIZU, CAT — e.g.
 * FCzPY9ofieeTPMKwteuVq7qaENvUsG1UjGCUgnNq2Nko):
 *   1. Publish the embedded coin template with patched identifiers (mirrors
 *      @mysten/move-bytecode-template update_identifiers, which needs wasm we
 *      cannot run in the Worker) + 0x2::package::make_immutable.
 *   2. One atomic transaction: <coin>::create → settings::spot → split the
 *      1 SUI pool seed and the config's launch fee off the gas coin →
 *      launchpad::launch_registered<COIN, SUI> → transfer the returned
 *      PoolCap, LpPosition and change coin to the launch wallet.
 *
 * Fully backed / composite pools are deliberately NOT used: they require an
 * Aftermath clearing house plus a Suilend market and kept failing at
 * activation. A virtual pool is the raise-first curve, which is what a social
 * launch needs. Never fabricates a result: CONFIRMED only after Sui confirms
 * both steps and emits pool::PoolCreated.
 */

import { Transaction, type TransactionArgument } from "@mysten/sui/transactions";

import {
  encodeString,
  parseModule,
  readUleb,
  serializeModule,
} from "@/lib/terminal/coin-template.server";
import {
  PERPSPLEXITY_CONFIG_ID,
  PERPSPLEXITY_CURVE_BASE_FEE_BPS,
  PERPSPLEXITY_CURVE_DEFAULT_CAP_MIST,
  PERPSPLEXITY_CURVE_HIBERNATION,
  PERPSPLEXITY_CURVE_QUOTE_TYPE,
  PERPSPLEXITY_CURVE_SEED_MIST,
  PERPSPLEXITY_CURVE_SUPPLY,
  PERPSPLEXITY_LAUNCHPAD_ID,
  PERPSPLEXITY_ORIGINAL_PACKAGE_ID,
  PERPSPLEXITY_PACKAGE_ID,
  perpsCurveVirtualQuote,
} from "@/lib/terminal/perpsplexity";
import {
  gasCoins,
  loadDeployer,
  normalizeType,
  referenceGasPrice,
  rpc,
  sharedRef,
  signAndExecute,
  withGas,
} from "@/lib/terminal/suipump-launch.server";

export interface PerpsLaunchInput {
  name: string;
  symbol: string;
  description: string;
  iconUrl: string;
  /** Kept for callers; virtual curves carry no perp market of their own. */
  underlying?: string | null;
  long?: boolean;
  leverageBps?: number;
  /** Starting market cap in USD; converted to SUI at the live spot price. */
  startingCapUsd?: number | null;
}

export interface PerpsLaunchResult {
  status: "CONFIRMED" | "FAILED";
  digest: string | null;
  error: string | null;
  coinType: string | null;
  packageId: string | null;
  poolId: string | null;
  engineId: string | null;
}

/** Official coin template (sui 1.79.1), embedded verbatim in the frontend. */
const TEMPLATE_MODULE =
  "oRzrCwcAAAUJAQAOAg4kAzIlBFcEBVtPB6oBygEI9AJgCtQDDAzgAzMADgEUAggCCQIRAhUCFgADCAAAAQwAAQQHAAIFDAEAAQMACAADAgABAAEEBwQABgYCAAANAAEAAAoCAwADEAoLAQgECwQBAAQPAAQABRIIAQEMBhMFBgAFBwIJAQcIBwAHCAEHCAQIAggCCAIIAgcIBwILBQEIAAsDAQgAAQgGAQYIBwEFAQgBAgkABQEIAAcHCAQCCAIIAggCCAIHCAcCCwUBCQALAwEJAAxDb2luUmVnaXN0cnkKQ3JlYXRvckNhcBNDdXJyZW5jeUluaXRpYWxpemVyBE1FTUUGU3RyaW5nC1RyZWFzdXJ5Q2FwCVR4Q29udGV4dANVSUQEY29pbg1jb2luX3JlZ2lzdHJ5BmNyZWF0ZQZkZWxldGUCaWQEaW5pdARtZW1lA25ldwxuZXdfY3VycmVuY3kGb2JqZWN0D3B1YmxpY190cmFuc2ZlcgZzZW5kZXIGc3RyaW5nCHRyYW5zZmVyCnR4X2NvbnRleHQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAgEMCAYBAgEMCAYAAAAAAQgKABEEEgELAC4RBjgAAgABAQAAAQwLABMBEQMLATEGCwMLAgsECwULBjgBAgAA";
const TEMPLATE_DEPENDENCIES = [
  "0x0000000000000000000000000000000000000000000000000000000000000001",
  "0x0000000000000000000000000000000000000000000000000000000000000002",
];

const CLOCK = "0x6";
const COIN_REGISTRY = "0x000000000000000000000000000000000000000000000000000000000000000c";
const IDENTIFIERS_KIND = 0x7;
const MOVE_KEYWORDS = new Set(
  "abort.acquires.as.break.const.continue.copy.else.entry.enum.false.friend.fun.has.if.invariant.let.loop.macro.match.module.move.mut.native.public.return.script.spec.struct.true.type.use.while".split("."),
);
const RESERVED_IDENTIFIERS = new Set([
  "id", "cap", "registry", "name", "symbol", "description", "ctx", "init",
  "create", "delete", "new", "sender", "coin", "object", "transfer",
  "string", "option", "url", "ascii", "tx_context", "coin_registry",
  "package", "types", "witness",
]);
const PUBLISH_BUDGET = 500_000_000;
const LAUNCH_BUDGET = 900_000_000;
/** Headroom kept in the gas coin on top of the seed + launch fee. */
const GAS_HEADROOM_MIST = 1_000_000_000n;

function deriveNames(rawSymbol: string): { module: string; struct: string } {
  const symbol = rawSymbol.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(symbol)) throw new Error("Ticker must be 2–10 letters/digits starting with a letter.");
  if (symbol === "UID" || symbol === "ID") throw new Error("That ticker is not allowed.");
  let module = symbol.toLowerCase();
  if (MOVE_KEYWORDS.has(module) || RESERVED_IDENTIFIERS.has(module)) module = `${module}_coin`;
  return { module, struct: symbol };
}

/** Patches the identifiers table (kind 0x7) — same result as update_identifiers. */
export function patchTemplateIdentifiers(
  moduleBase64: string,
  names: { module: string; struct: string },
): string {
  const bytes = new Uint8Array(Buffer.from(moduleBase64, "base64"));
  const parsed = parseModule(bytes);
  const index = parsed.tables.findIndex((table) => table.kind === IDENTIFIERS_KIND);
  const table = index >= 0 ? parsed.tables[index] : undefined;
  if (!table) throw new Error("Coin template has no identifiers table.");
  const body = parsed.body;
  const cursor = { offset: table.offset };
  const end = table.offset + table.length;
  // The identifiers table is a bare sequence of length-prefixed strings; the
  // table's own length delimits it, there is no leading count.
  const identifiers: string[] = [];
  while (cursor.offset < end) {
    const length = Number(readUleb(body, cursor));
    if (length <= 0 || cursor.offset + length > end) {
      throw new Error("Coin template identifiers table is malformed.");
    }
    identifiers.push(Buffer.from(body.slice(cursor.offset, cursor.offset + length)).toString("utf8"));
    cursor.offset += length;
  }
  if (cursor.offset !== end || !identifiers.includes("meme") || !identifiers.includes("MEME")) {
    throw new Error("Coin template identifiers table is malformed.");
  }
  const patched = identifiers.map((id) => (id === "meme" ? names.module : id === "MEME" ? names.struct : id));
  const tableBytes = patched.flatMap((id) => encodeString(id));
  const delta = tableBytes.length - table.length;
  const newBody = new Uint8Array(body.length + delta);
  newBody.set(body.slice(0, table.offset), 0);
  newBody.set(tableBytes, table.offset);
  newBody.set(body.slice(table.offset + table.length), table.offset + tableBytes.length);
  parsed.tables = parsed.tables.map((entry, entryIndex) => {
    if (entryIndex === index) return { ...entry, length: tableBytes.length };
    if (entry.offset > table.offset) return { ...entry, offset: entry.offset + delta };
    return entry;
  });
  parsed.body = newBody;
  return Buffer.from(serializeModule(parsed)).toString("base64");
}

async function objectRef(id: string, label: string): Promise<{ objectId: string; version: string; digest: string }> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = await rpc<{ data?: { version?: string; digest?: string } | null }>(
      "sui_getObject",
      [id, { showOwner: true }],
    ).catch(() => ({ data: null }));
    if (result.data?.version && result.data.digest) {
      return { objectId: id, version: String(result.data.version), digest: result.data.digest };
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`${label} is not visible on chain yet.`);
}

async function readLaunchFeeMist(): Promise<bigint> {
  const result = await rpc<{
    data?: { content?: { fields?: { params?: { fields?: { launch_fee_mist?: string } }; paused?: boolean } } | null };
  }>("sui_getObject", [PERPSPLEXITY_CONFIG_ID, { showContent: true }]);
  const fields = result.data?.content?.fields;
  if (!fields) throw new Error("Could not read the Perpsplexity launch configuration.");
  if (fields.paused) throw new Error("Perpsplexity launches are paused right now.");
  return BigInt(fields.params?.fields?.launch_fee_mist ?? "0");
}

/** Live SUI spot price, used only to translate a requested USD cap into MIST. */
async function suiUsdPrice(): Promise<number> {
  try {
    const res = await fetch("https://api.dexscreener.com/latest/dex/tokens/0x2::sui::SUI", {
      headers: { accept: "application/json" },
    });
    const json = (await res.json()) as {
      pairs?: { chainId?: string; priceUsd?: string; liquidity?: { usd?: number } }[];
    };
    let best = 0;
    let deepest = 0;
    for (const pair of json.pairs ?? []) {
      if (pair.chainId !== "sui") continue;
      const price = Number(pair.priceUsd ?? 0);
      const liquidity = Number(pair.liquidity?.usd ?? 0);
      if (price > 0 && liquidity >= deepest) {
        deepest = liquidity;
        best = price;
      }
    }
    return best;
  } catch {
    return 0;
  }
}

/** Starting market cap in MIST — from the requested USD cap when priceable. */
async function startingCapMist(startingCapUsd: number | null | undefined): Promise<bigint> {
  if (!startingCapUsd || startingCapUsd <= 0) return PERPSPLEXITY_CURVE_DEFAULT_CAP_MIST;
  const price = await suiUsdPrice();
  if (price <= 0) return PERPSPLEXITY_CURVE_DEFAULT_CAP_MIST;
  const sui = startingCapUsd / price;
  const mist = BigInt(Math.round(sui * 1_000_000_000));
  return mist > PERPSPLEXITY_CURVE_SEED_MIST ? mist : PERPSPLEXITY_CURVE_DEFAULT_CAP_MIST;
}

interface TxReceipt {
  ok: boolean;
  error: string | null;
  events: { type: string; parsedJson?: Record<string, unknown> }[];
  created: { objectId: string; objectType: string }[];
}

async function fetchReceipt(digest: string): Promise<TxReceipt> {
  const block = await rpc<{
    effects?: { status?: { status?: string; error?: string } };
    events?: { type?: string; parsedJson?: Record<string, unknown> }[];
    objectChanges?: { type: string; objectId?: string; objectType?: string }[];
  }>("sui_getTransactionBlock", [digest, { showEffects: true, showEvents: true, showObjectChanges: true }]);
  const ok = block.effects?.status?.status === "success";
  return {
    ok,
    error: ok ? null : block.effects?.status?.error ?? "Transaction failed.",
    events: (block.events ?? [])
      .filter((event) => typeof event.type === "string")
      .map((event) => ({ type: normalizeType(event.type as string), parsedJson: event.parsedJson ?? {} })),
    created: (block.objectChanges ?? [])
      .filter((change) => change.type === "created" && change.objectId && change.objectType)
      .map((change) => ({ objectId: change.objectId as string, objectType: normalizeType(change.objectType as string) })),
  };
}

function eventField(event: { parsedJson?: Record<string, unknown> } | undefined, key: string): string | null {
  const value = event?.parsedJson?.[key];
  return typeof value === "string" ? value : null;
}

function fail(error: string, extra: Partial<PerpsLaunchResult> = {}): PerpsLaunchResult {
  return {
    status: "FAILED",
    digest: extra.digest ?? null,
    error,
    coinType: extra.coinType ?? null,
    packageId: extra.packageId ?? null,
    poolId: extra.poolId ?? null,
    engineId: extra.engineId ?? null,
  };
}

export async function launchOnPerpsplexity(input: PerpsLaunchInput): Promise<PerpsLaunchResult> {
  const keypair = await loadDeployer();
  if (!keypair) return fail("The bot launch wallet is not configured.");
  const sender = keypair.getPublicKey().toSuiAddress();

  let names: { module: string; struct: string };
  try {
    names = deriveNames(input.symbol);
  } catch (error) {
    return fail((error as Error).message);
  }

  let launchFeeMist: bigint;
  try {
    launchFeeMist = await readLaunchFeeMist();
  } catch (error) {
    return fail((error as Error).message);
  }

  let virtualQuote: bigint;
  try {
    virtualQuote = perpsCurveVirtualQuote(await startingCapMist(input.startingCapUsd));
  } catch (error) {
    return fail((error as Error).message);
  }

  const [gas, gasPrice] = await Promise.all([gasCoins(sender), referenceGasPrice().catch(() => 1000)]);
  if (gas.length === 0) return fail("The bot wallet has no SUI for gas or the launch fee.");
  // Every transaction consumes and recreates the gas coin, so its version and
  // digest change. Reusing a stale reference makes the node reject the next
  // transaction, so each step re-reads the wallet's current coins.
  const freshGas = async (): Promise<typeof gas> => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const coins = await gasCoins(sender).catch(() => []);
      if (coins.length > 0) return coins;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return [];
  };

  const description =
    input.description.trim() || `${input.name} — bonding-curve memecoin on Perpsplexity, launched via OurBlast.`;

  // Step 1 — publish the coin package (official flow: publish patched
  // template modules, then make the upgrade cap immutable).
  let moduleBase64: string;
  try {
    moduleBase64 = patchTemplateIdentifiers(TEMPLATE_MODULE, names);
  } catch (error) {
    return fail(`Could not patch the coin template: ${(error as Error).message}`);
  }
  const publishTx = new Transaction();
  withGas(publishTx, sender, gas, gasPrice, PUBLISH_BUDGET);
  const [upgradeCap] = publishTx.publish({
    modules: [Array.from(Buffer.from(moduleBase64, "base64"))],
    dependencies: TEMPLATE_DEPENDENCIES,
  });
  publishTx.moveCall({ target: "0x2::package::make_immutable", arguments: [upgradeCap!] });
  const publishRun = await signAndExecute(publishTx, keypair);
  if (!publishRun.ok || !publishRun.digest) return fail(publishRun.error ?? "Coin package publish failed.");
  const publishReceipt = await fetchReceipt(publishRun.digest);
  if (!publishReceipt.ok) return fail(publishReceipt.error ?? "Coin package publish failed on chain.");
  const creatorCap = publishReceipt.created.find((change) => change.objectType.endsWith("::CreatorCap"));
  if (!creatorCap) return fail("The coin package published but no creator capability appeared.");
  const packageId = creatorCap.objectType.split("::")[0]!;
  const coinType = `${packageId}::${names.module}::${names.struct}`;

  // Step 2 — the virtual pool launch: one atomic launch_registered call.
  let capRef: { objectId: string; version: string; digest: string };
  try {
    capRef = await objectRef(creatorCap.objectId, "The coin creator capability");
  } catch (error) {
    return fail((error as Error).message, { coinType, packageId });
  }
  const [launchpadRef, configRef, clockRef, coinRegistryRef] = await Promise.all([
    sharedRef(PERPSPLEXITY_LAUNCHPAD_ID),
    sharedRef(PERPSPLEXITY_CONFIG_ID),
    sharedRef(CLOCK),
    // Sui's coin registry is a shared object with a real initial version; a
    // hardcoded version 1 makes the whole launch unusable on chain.
    sharedRef(COIN_REGISTRY),
  ]);

  const launchGas = await freshGas();
  if (launchGas.length === 0) {
    return fail(
      "The bot wallet has no SUI coin left to pay gas. Send a few SUI to it with a normal transfer, then launch again.",
      { coinType, packageId },
    );
  }
  const needed = PERPSPLEXITY_CURVE_SEED_MIST + launchFeeMist + GAS_HEADROOM_MIST;
  const balance = await rpc<{ totalBalance?: string }>("suix_getBalance", [sender, "0x2::sui::SUI"])
    .then((result) => BigInt(result.totalBalance ?? "0"))
    .catch(() => 0n);
  if (balance > 0n && balance < needed) {
    return fail(
      `The bot wallet needs about ${Number(needed) / 1_000_000_000} SUI for the 1 SUI pool seed, the ${Number(launchFeeMist) / 1_000_000_000} SUI launch fee and gas.`,
      { coinType, packageId },
    );
  }

  const tx = new Transaction();
  withGas(tx, sender, launchGas, gasPrice, LAUNCH_BUDGET);
  const createResults = tx.moveCall({
    target: `${packageId}::${names.module}::create`,
    arguments: [
      tx.objectRef(capRef),
      tx.sharedObjectRef({ ...coinRegistryRef, mutable: true }),
      tx.pure.string(input.name.trim()),
      tx.pure.string(names.struct),
      tx.pure.string(description),
      tx.pure.string(input.iconUrl),
    ],
  }) as TransactionArgument[];
  const initializer = createResults[0]!;
  const treasuryCap = createResults[1]!;
  const settings = tx.moveCall({
    target: `${PERPSPLEXITY_PACKAGE_ID}::settings::spot`,
    arguments: [
      tx.pure.u64(PERPSPLEXITY_CURVE_BASE_FEE_BPS),
      tx.pure.bool(PERPSPLEXITY_CURVE_HIBERNATION),
    ],
  });
  // The official form splits both the 1 SUI pool seed and the launch fee off
  // the gas coin, in that order.
  const [seedCoin, feeCoin] = tx.splitCoins(tx.gas, [
    tx.pure.u64(PERPSPLEXITY_CURVE_SEED_MIST),
    tx.pure.u64(launchFeeMist),
  ]);
  const launchResults = tx.moveCall({
    target: `${PERPSPLEXITY_PACKAGE_ID}::launchpad::launch_registered`,
    typeArguments: [coinType, PERPSPLEXITY_CURVE_QUOTE_TYPE],
    arguments: [
      tx.sharedObjectRef({ ...launchpadRef, mutable: true }),
      tx.sharedObjectRef({ ...configRef, mutable: false }),
      treasuryCap,
      initializer,
      seedCoin!,
      feeCoin!,
      tx.pure.u64(PERPSPLEXITY_CURVE_SUPPLY),
      settings,
      tx.pure.u64(virtualQuote),
      tx.sharedObjectRef({ ...clockRef, mutable: false }),
    ],
  }) as TransactionArgument[];
  tx.transferObjects([launchResults[0]!, launchResults[1]!, launchResults[2]!], sender);

  const run = await signAndExecute(tx, keypair);
  if (!run.ok || !run.digest) {
    return fail(run.error ?? "The Perpsplexity curve launch failed.", { digest: run.digest, coinType, packageId });
  }
  const receipt = await fetchReceipt(run.digest);
  if (!receipt.ok) {
    return fail(receipt.error ?? "The Perpsplexity curve launch failed on chain.", {
      digest: run.digest,
      coinType,
      packageId,
    });
  }
  const created = receipt.events.find(
    (event) => event.type === `${PERPSPLEXITY_ORIGINAL_PACKAGE_ID}::pool::PoolCreated`,
  );
  const poolId = eventField(created, "pool");
  if (!poolId) {
    return fail("The launch finished without the pool's on-chain confirmation.", {
      digest: run.digest,
      coinType,
      packageId,
    });
  }

  return {
    status: "CONFIRMED",
    digest: run.digest,
    error: null,
    coinType,
    packageId,
    poolId,
    engineId: null,
  };
}
