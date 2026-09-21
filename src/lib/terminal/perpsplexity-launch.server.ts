/**
 * OurBlast launch path for Perpsplexity (perpsplexity.app) composite pools.
 *
 * Reproduces the official frontend launch flow exactly, traced from the live
 * mainnet bundle (launch chunk + composite-deployments chunk):
 *   1. Publish the embedded coin template with patched identifiers (mirrors
 *      @mysten/move-bytecode-template update_identifiers, which needs wasm we
 *      cannot run in the Worker) + 0x2::package::make_immutable.
 *   2. settings::new + launchpad::prepare_composite_registered.
 *   3. Read the composite_pool::Prepared event, then engine::activate +
 *      composite_pool::activate + aftermath clearing_house::share.
 * Never fabricates a result: CONFIRMED only after Sui confirms each step.
 */

import { Transaction, type TransactionArgument } from "@mysten/sui/transactions";

import {
  encodeString,
  parseModule,
  readUleb,
  serializeModule,
} from "@/lib/terminal/coin-template.server";
import {
  PERPSPLEXITY_AFTERMATH_PACKAGE_ID,
  PERPSPLEXITY_CONFIG_ID,
  PERPSPLEXITY_ENGINE_PACKAGE_ID,
  PERPSPLEXITY_LAUNCHPAD_ID,
  PERPSPLEXITY_LENDING_MARKET_ID,
  PERPSPLEXITY_LENDING_TYPE,
  PERPSPLEXITY_ORIGINAL_PACKAGE_ID,
  PERPSPLEXITY_PACKAGE_ID,
  PERPSPLEXITY_QUOTE_DECIMALS,
  PERPSPLEXITY_QUOTE_TYPE,
  PERPSPLEXITY_REGISTRY_ID,
  perpsQuoteUnits,
  perpsVirtualQuote,
  resolvePerpsMarket,
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
  underlying: string;
  long: boolean;
  leverageBps: number;
  startingCapUsd: number | null;
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
const COIN_REGISTRY = "0xc";
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
const PREPARE_BUDGET = 500_000_000;
const ACTIVATE_BUDGET = 900_000_000;
const ACTIVATE_DEADLINE_MS = 60_000;

// Launch settings, matching the official launch form defaults (protocol chunk).
const SETTINGS = {
  synthBps: 7000,
  hotBps: 2000,
  lendBps: 1000,
  marginBps: 0,
  collateralLendBps: 2000,
  maxTradeBps: 0,
  hibernationFloorMicros: 0n,
  hibernationEnabled: false,
  pauseOnMarketClose: true,
};
const ENGINE_BUFFER_BPS = 1000;
const REINVEST_BPS = 5000;
const SUPPLY = 1_000_000_000n * 1_000_000_000n;
const SEED_UNITS = 1_000_000n; // 1 USDC, the official form's minimum/default seed.

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

function settingsArgs(tx: Transaction): TransactionArgument[] {
  return [
    tx.pure.u64(SETTINGS.synthBps),
    tx.pure.u64(SETTINGS.hotBps),
    tx.pure.u64(SETTINGS.lendBps),
    tx.pure.u64(SETTINGS.marginBps),
    tx.pure.u64(SETTINGS.collateralLendBps),
    tx.pure.u64(SETTINGS.maxTradeBps),
    tx.pure.u64(SETTINGS.hibernationFloorMicros),
    tx.pure.bool(SETTINGS.hibernationEnabled),
    tx.pure.bool(SETTINGS.pauseOnMarketClose),
  ];
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

async function usdcSeedCoin(tx: Transaction, owner: string, seedUnits: bigint): Promise<TransactionArgument> {
  const result = await rpc<{
    data: { coinObjectId: string; version: string; digest: string; balance: string }[];
  }>("suix_getCoins", [owner, PERPSPLEXITY_QUOTE_TYPE, null, 50]);
  const coins = (result.data ?? [])
    .map((coin) => ({
      objectId: coin.coinObjectId,
      version: String(coin.version),
      digest: coin.digest,
      balance: BigInt(coin.balance),
    }))
    .sort((a, b) => (a.balance > b.balance ? -1 : 1));
  const total = coins.reduce((sum, coin) => sum + coin.balance, 0n);
  if (total < seedUnits) throw new Error("The bot wallet does not hold enough USDC for the launch seed.");
  const big = coins.find((coin) => coin.balance >= seedUnits);
  if (big) {
    return tx.splitCoins(tx.objectRef({ objectId: big.objectId, version: big.version, digest: big.digest }), [seedUnits])[0]!;
  }
  const base = coins[0];
  if (!base) throw new Error("The bot wallet holds no USDC.");
  const baseRef = tx.objectRef({ objectId: base.objectId, version: base.version, digest: base.digest });
  const rest = coins.slice(1);
  if (rest.length > 0) {
    tx.mergeCoins(
      baseRef,
      rest.map((coin) => tx.objectRef({ objectId: coin.objectId, version: coin.version, digest: coin.digest })),
    );
  }
  return tx.splitCoins(baseRef, [seedUnits])[0]!;
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
  const market = resolvePerpsMarket(input.underlying);
  if (!market) {
    return fail(`Unknown underlying "${input.underlying}". Perpsplexity supports markets like NVDA, TSLA, BTC, ETH, SOL.`);
  }
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

  const [gas, gasPrice] = await Promise.all([gasCoins(sender), referenceGasPrice().catch(() => 1000)]);
  if (gas.length === 0) return fail("The bot wallet has no SUI for gas or the launch fee.");

  const startingCapUnits = input.startingCapUsd && input.startingCapUsd > 0
    ? perpsQuoteUnits(Math.round(input.startingCapUsd))
    : 0n;
  let virtualQuote = 0n;
  try {
    virtualQuote = perpsVirtualQuote(startingCapUnits, SEED_UNITS);
  } catch (error) {
    return fail((error as Error).message);
  }

  const description =
    input.description.trim() || `${input.name} — market-backed memecoin on Perpsplexity, launched via OurBlast.`;

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

  // Step 2 — prepare the composite pool (token + pool + leveraged position,
  // one atomic call, exactly like the official form).
  let capRef: { objectId: string; version: string; digest: string };
  try {
    capRef = await objectRef(creatorCap.objectId, "The coin creator capability");
  } catch (error) {
    return fail((error as Error).message, { coinType, packageId });
  }
  const [registryRef, marketRef, lendingRef, baseOracleRef, collateralOracleRef, launchpadRef, configRef] =
    await Promise.all([
      sharedRef(PERPSPLEXITY_REGISTRY_ID),
      sharedRef(market.marketId),
      sharedRef(PERPSPLEXITY_LENDING_MARKET_ID),
      sharedRef(market.baseOracleId),
      sharedRef(market.collateralOracleId),
      sharedRef(PERPSPLEXITY_LAUNCHPAD_ID),
      sharedRef(PERPSPLEXITY_CONFIG_ID),
    ]);
  const prepareTx = new Transaction();
  withGas(prepareTx, sender, gas, gasPrice, PREPARE_BUDGET);
  const createResults = prepareTx.moveCall({
    target: `${packageId}::${names.module}::create`,
    arguments: [
      prepareTx.objectRef(capRef),
      prepareTx.sharedObjectRef({ objectId: COIN_REGISTRY, initialSharedVersion: "1", mutable: true }),
      prepareTx.pure.string(input.name.trim()),
      prepareTx.pure.string(names.struct),
      prepareTx.pure.string(description),
      prepareTx.pure.string(input.iconUrl),
    ],
  }) as TransactionArgument[];
  const metadata = createResults[0]!;
  const treasuryCap = createResults[1]!;
  const settings = prepareTx.moveCall({
    target: `${PERPSPLEXITY_PACKAGE_ID}::settings::new`,
    arguments: settingsArgs(prepareTx),
  });
  let seed: TransactionArgument;
  try {
    seed = await usdcSeedCoin(prepareTx, sender, SEED_UNITS);
  } catch (error) {
    return fail((error as Error).message, { coinType, packageId });
  }
  const fee = launchFeeMist > 0n
    ? prepareTx.splitCoins(prepareTx.gas, [launchFeeMist])[0]!
    : prepareTx.moveCall({ target: "0x2::coin::zero", typeArguments: ["0x2::sui::SUI"] });
  const prepareResults = prepareTx.moveCall({
    target: `${PERPSPLEXITY_PACKAGE_ID}::launchpad::prepare_composite_registered`,
    typeArguments: [coinType, PERPSPLEXITY_LENDING_TYPE, PERPSPLEXITY_QUOTE_TYPE],
    arguments: [
      prepareTx.sharedObjectRef({ ...launchpadRef, mutable: true }),
      prepareTx.sharedObjectRef({ ...configRef, mutable: true }),
      treasuryCap,
      metadata,
      prepareTx.sharedObjectRef({ ...registryRef, mutable: true }),
      prepareTx.sharedObjectRef({ ...marketRef, mutable: true }),
      prepareTx.sharedObjectRef({ ...lendingRef, mutable: true }),
      prepareTx.sharedObjectRef({ ...baseOracleRef, mutable: false }),
      prepareTx.sharedObjectRef({ ...collateralOracleRef, mutable: false }),
      seed,
      fee,
      prepareTx.pure.u64(SUPPLY),
      settings,
      prepareTx.pure.u64(ENGINE_BUFFER_BPS),
      prepareTx.pure.bool(input.long),
      prepareTx.pure.u64(input.leverageBps),
      prepareTx.pure.u64(REINVEST_BPS),
      prepareTx.pure.u64(virtualQuote),
      prepareTx.object(CLOCK),
    ],
  }) as TransactionArgument[];
  prepareTx.transferObjects([prepareResults[0]!, prepareResults[1]!], sender);
  const prepareRun = await signAndExecute(prepareTx, keypair);
  if (!prepareRun.ok || !prepareRun.digest) {
    return fail(prepareRun.error ?? "Pool preparation failed.", { digest: prepareRun.digest, coinType, packageId });
  }
  const prepareReceipt = await fetchReceipt(prepareRun.digest);
  if (!prepareReceipt.ok) {
    return fail(prepareReceipt.error ?? "Pool preparation failed on chain.", { digest: prepareRun.digest, coinType, packageId });
  }
  const preparedEvent = prepareReceipt.events.find(
    (event) => event.type === `${PERPSPLEXITY_ORIGINAL_PACKAGE_ID}::composite_pool::Prepared`,
  );
  const prepared = {
    pool: eventField(preparedEvent, "pool"),
    engine: eventField(preparedEvent, "engine"),
    engineVault: eventField(preparedEvent, "engine_vault"),
    engineAccount: eventField(preparedEvent, "engine_account"),
    engineSleeve: eventField(preparedEvent, "engine_sleeve"),
    poolSleeve: eventField(preparedEvent, "pool_sleeve"),
    reserve: eventField(preparedEvent, "reserve"),
    reserveAccount: eventField(preparedEvent, "reserve_account"),
    creator: eventField(preparedEvent, "creator"),
  };
  if (!prepared.pool || !prepared.engine || !prepared.engineVault || !prepared.engineAccount
    || !prepared.engineSleeve || !prepared.poolSleeve || !prepared.reserve || !prepared.reserveAccount) {
    return fail("The pool prepared but its on-chain receipt was missing.", { digest: prepareRun.digest, coinType, packageId });
  }
  if (prepared.creator && prepared.creator !== sender) {
    return fail("The pool receipt named a different creator wallet.", { digest: prepareRun.digest, coinType, packageId });
  }
  const poolCap = prepareReceipt.created.find(
    (change) => change.objectType === `${PERPSPLEXITY_ORIGINAL_PACKAGE_ID}::composite_pool::PoolCap`,
  );
  if (!poolCap) {
    return fail("The pool capability did not reach the launch wallet.", { digest: prepareRun.digest, coinType, packageId });
  }

  // Step 3 — activate (official flow: a dry run reads the quoted NAV, then
  // the real call uses it with the form's 1% slippage guard).
  const poolId = prepared.pool;
  const engineId = prepared.engine;
  const deadlineMs = Date.now() + ACTIVATE_DEADLINE_MS;
  const buildActivate = async (minimum: bigint): Promise<Transaction> => {
    const [poolR, engineR, vaultR, accountR, sleeveR, poolSleeveR, reserveR, reserveAccountR, freshCap] =
      await Promise.all([
        sharedRef(poolId),
        sharedRef(engineId),
        sharedRef(prepared.engineVault!),
        sharedRef(prepared.engineAccount!),
        sharedRef(prepared.engineSleeve!),
        sharedRef(prepared.poolSleeve!),
        sharedRef(prepared.reserve!),
        sharedRef(prepared.reserveAccount!),
        objectRef(poolCap.objectId, "The pool capability"),
      ]);
    const tx = new Transaction();
    withGas(tx, sender, gas, gasPrice, ACTIVATE_BUDGET);
    tx.moveCall({
      target: `${PERPSPLEXITY_ENGINE_PACKAGE_ID}::engine::activate`,
      typeArguments: [PERPSPLEXITY_LENDING_TYPE, PERPSPLEXITY_QUOTE_TYPE],
      arguments: [
        tx.sharedObjectRef({ ...engineR, mutable: true }),
        tx.sharedObjectRef({ ...vaultR, mutable: true }),
        tx.sharedObjectRef({ ...accountR, mutable: true }),
        tx.sharedObjectRef({ ...marketRef, mutable: true }),
      ],
    });
    const activateResults = tx.moveCall({
      target: `${PERPSPLEXITY_PACKAGE_ID}::composite_pool::activate`,
      typeArguments: [coinType, PERPSPLEXITY_LENDING_TYPE, PERPSPLEXITY_QUOTE_TYPE],
      arguments: [
        tx.sharedObjectRef({ ...poolR, mutable: true }),
        tx.sharedObjectRef({ ...configRef, mutable: true }),
        tx.objectRef(freshCap),
        tx.sharedObjectRef({ ...engineR, mutable: true }),
        tx.sharedObjectRef({ ...vaultR, mutable: true }),
        tx.sharedObjectRef({ ...accountR, mutable: true }),
        tx.sharedObjectRef({ ...marketRef, mutable: true }),
        tx.sharedObjectRef({ ...sleeveR, mutable: true }),
        tx.sharedObjectRef({ ...lendingRef, mutable: true }),
        tx.sharedObjectRef({ ...poolSleeveR, mutable: true }),
        tx.sharedObjectRef({ ...reserveR, mutable: true }),
        tx.sharedObjectRef({ ...reserveAccountR, mutable: true }),
        tx.sharedObjectRef({ ...registryRef, mutable: true }),
        tx.sharedObjectRef({ ...baseOracleRef, mutable: false }),
        tx.sharedObjectRef({ ...collateralOracleRef, mutable: false }),
        tx.pure.u64(minimum),
        tx.pure.u64(BigInt(deadlineMs)),
        tx.object(CLOCK),
      ],
    }) as TransactionArgument[];
    tx.moveCall({
      target: `${PERPSPLEXITY_AFTERMATH_PACKAGE_ID}::clearing_house::share`,
      typeArguments: [PERPSPLEXITY_QUOTE_TYPE],
      arguments: [activateResults[0]!],
    });
    tx.transferObjects([activateResults[1]!], sender);
    return tx;
  };

  let minimum = 1n;
  try {
    const probeTx = await buildActivate(1n);
    const probeBytes = await probeTx.build();
    let inspected: { events?: { type?: string; parsedJson?: Record<string, unknown> }[] } | null = null;
    for (const method of ["suix_devInspectTransactionBlock", "sui_devInspectTransactionBlock"]) {
      try {
        inspected = await rpc(method, [sender, Buffer.from(probeBytes).toString("base64"), null, null]);
        break;
      } catch {
        inspected = null;
      }
    }
    const created = (inspected?.events ?? []).find(
      (event) => typeof event.type === "string"
        && normalizeType(event.type) === `${PERPSPLEXITY_ORIGINAL_PACKAGE_ID}::composite_pool::Created`,
    );
    const nav = created?.parsedJson?.["quote_nav"];
    if (typeof nav === "string" && /^\d+$/.test(nav)) minimum = (BigInt(nav) * 99n) / 100n;
  } catch {
    minimum = 1n;
  }

  let activateTx: Transaction;
  try {
    activateTx = await buildActivate(minimum);
  } catch (error) {
    return fail((error as Error).message, { coinType, packageId, poolId, engineId });
  }
  const activateRun = await signAndExecute(activateTx, keypair);
  if (!activateRun.ok || !activateRun.digest) {
    return fail(activateRun.error ?? "Activation failed.", { digest: activateRun.digest, coinType, packageId, poolId, engineId });
  }
  const activateReceipt = await fetchReceipt(activateRun.digest);
  if (!activateReceipt.ok) {
    return fail(activateReceipt.error ?? "Activation failed on chain.", { digest: activateRun.digest, coinType, packageId, poolId, engineId });
  }
  const createdEvent = activateReceipt.events.find(
    (event) => event.type === `${PERPSPLEXITY_ORIGINAL_PACKAGE_ID}::composite_pool::Created`
      && eventField(event, "pool") === poolId,
  );
  if (!createdEvent) {
    return fail("Activation finished without the pool's on-chain confirmation.", {
      digest: activateRun.digest,
      coinType,
      packageId,
      poolId,
      engineId,
    });
  }

  return {
    status: "CONFIRMED",
    digest: activateRun.digest,
    error: null,
    coinType,
    packageId,
    poolId,
    engineId,
  };
}
