/**
 * OurBlast launch path for Perpsplexity (perpsplexity.app) composite pools.
 *
 * Reproduces the official frontend launch flow exactly, traced from the live
 * mainnet bundle (launch.pretty.js + composite-deployments chunk):
 *   1. Publish the embedded coin template (identifiers patched per ticker,
 *      mirroring @mysten/move-bytecode-template update_identifiers, which
 *      needs wasm we cannot run in the Worker).
 *   2. `${packageId}::settings::new` + `${packageId}::launchpad::prepare_composite_registered`.
 *   3. Read the composite_pool::Prepared event, then
 *      `${enginePackageId}::engine::activate` +
 *      `${packageId}::composite_pool::activate` +
 *      `${aftermathPackageId}::clearing_house::share`.
 * Never fabricates a result: CONFIRMED only after Sui confirms each step.
 */

import { Transaction } from "@mysten/sui/transactions";

import {
  encodeString,
  encodeUleb,
  parseModule,
  readUleb,
  serializeModule,
} from "@/lib/terminal/coin-template.server";
import {
  PERPS_MAINNET,
  PERPS_ORIGINAL_PACKAGE_ID,
  perpsDecimalUnits,
  perpsMarket,
  perpsMicros,
  perpsVirtualQuote,
} from "@/lib/terminal/perpsplexity";
import {
  gasCoins,
  loadDeployer,
  normalizeType,
  rpc,
  signAndExecute,
  sharedRef,
  withGas,
  type OwnedObject,
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
  callerXLink: string | null;
  callerTweetText: string | null;
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

const MIST_PER_SUI = 1_000_000_000n;
const CLOCK = "0x6";
const COIN_REGISTRY = "0xc";
const IDENTIFIERS_KIND = 0x7;
const MOVE_KEYWORDS = new Set([
  "abort", "acquires", "as", "break", "const", "continue", "copy", "drop",
  "else", "false", "friend", "fun", "if", "invariant", "let", "loop",
  "module", "move", "native", "public", "return", "script", "spec",
  "struct", "true", "use", "while",
]);
const RESERVED_IDENTIFIERS = new Set([
  "id", "cap", "registry", "name", "symbol", "description", "ctx", "init",
  "create", "delete", "new", "sender", "coin", "object", "transfer",
  "string", "option", "url", "ascii", "tx_context", "coin_registry",
  "package", "types", "witness",
]);
const PUBLISH_BUDGET = 500_000_000;
const PREPARE_BUDGET = 500_000_000;
const ACTIVATE_BUDGET = 900_000_000;
const PREPARE_DEADLINE_MS = 120_000;
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
const SEED_UNITS = 1_000_000n; // 1 USDC, matching the official form default.

interface TemplateModule {
  label: string;
  base64: string;
}

function templateModules(): TemplateModule[] {
  const dotModule = import.meta.env["PERPS_TEMPLATE_DOT_MODULE"] ?? "";
  const coinModule = import.meta.env["PERPS_TEMPLATE_COIN_MODULE"] ?? "";
  if (!dotModule || !coinModule) return [];
  return [
    { label: "dot", base64: dotModule },
    { label: "coin", base64: coinModule },
  ];
}

function deriveNames(rawSymbol: string): { module: string; struct: string } {
  const symbol = rawSymbol.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(symbol)) throw new Error("Ticker must be 2–10 letters/digits starting with a letter.");
  if (symbol === "UID" || symbol === "ID") throw new Error("That ticker is not allowed.");
  let module = symbol.toLowerCase();
  if (MOVE_KEYWORDS.has(module) || RESERVED_IDENTIFIERS.has(module)) module = `${module}_coin`;
  return { module, struct: symbol };
}

/** Patches the identifiers table (kind 0x7) — same result as update_identifiers. */
function patchIdentifiers(moduleBase64: string, names: { module: string; struct: string }): string {
  const bytes = Buffer.from(moduleBase64, "base64");
  const parsed = parseModule(new Uint8Array(bytes));
  const index = parsed.tables.findIndex((table) => table.kind === IDENTIFIERS_KIND);
  if (index < 0) throw new Error("Coin template has no identifiers table.");
  const table = parsed.tables[index];
  const body = parsed.body;
  const cursor = { offset: table.offset };
  const count = Number(readUleb(body, cursor));
  const identifiers: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const length = Number(readUleb(body, cursor));
    identifiers.push(Buffer.from(body.slice(cursor.offset, cursor.offset + length)).toString("utf8"));
    cursor.offset += length;
  }
  if (cursor.offset !== table.offset + table.length) throw new Error("Coin template identifiers table is malformed.");
  const patched = identifiers.map((id) => (id === "meme" ? names.module : id === "MEME" ? names.struct : id));
  const tableBytes = [count, ...[]].length >= 0
    ? [...encodeUleb(count), ...patched.flatMap((id) => encodeString(id))]
    : [];
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

function newSettingsArgs(tx: Transaction) {
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
    const result = await rpc<{ data?: { version: string; digest: string; owner?: unknown } | null }>(
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

async function usdcSeedCoin(
  tx: Transaction,
  owner: string,
  seedUnits: bigint,
): Promise<ReturnType<Transaction["splitCoins"]>[0]> {
  const result = await rpc<{
    data: { coinObjectId: string; version: string; digest: string; balance: string }[];
  }>("suix_getCoins", [owner, PERPS_MAINNET.quoteType, null, 50]);
  const coins = (result.data ?? [])
    .map((coin) => ({
      objectId: coin.coinObjectId,
      version: String(coin.version),
      digest: coin.digest,
      type: `0x2::coin::Coin<${PERPS_MAINNET.quoteType}>`,
      balance: BigInt(coin.balance),
    }))
    .sort((a, b) => (a.balance > b.balance ? -1 : 1));
  const total = coins.reduce((sum, coin) => sum + coin.balance, 0n);
  if (total < seedUnits) throw new Error("The bot wallet does not hold enough USDC for the launch seed.");
  const big = coins.find((coin) => coin.balance >= seedUnits);
  if (big) {
    return tx.splitCoins(tx.objectRef({ objectId: big.objectId, version: big.version, digest: big.digest }), [seedUnits])[0];
  }
  const [base, ...rest] = coins;
  const baseRef = tx.objectRef({ objectId: base.objectId, version: base.version, digest: base.digest });
  if (rest.length > 0) {
    tx.mergeCoins(
      baseRef,
      rest.map((coin) => tx.objectRef({ objectId: coin.objectId, version: coin.version, digest: coin.digest })),
    );
  }
  return tx.splitCoins(baseRef, [seedUnits])[0];
}

async function readLaunchFeeMist(): Promise<bigint> {
  const result = await rpc<{ data?: { content?: { fields?: { params?: { fields?: { launch_fee_mist?: string } }; paused?: boolean } } } }>(
    "sui_getObject",
    [PERPS_MAINNET.configId, { showContent: true }],
  );
  const fields = result.data?.content?.fields;
  if (!fields) throw new Error("Could not read the Perpsplexity launch configuration.");
  if (fields.paused) throw new Error("Perpsplexity launches are paused right now.");
  return BigInt(fields.params?.fields?.launch_fee_mist ?? "0");
}

interface TxReceipt {
  events: { type: string; parsedJson?: Record<string, unknown> }[];
  objectChanges: { type: string; objectId?: string; objectType?: string; owner?: unknown }[];
  ok: boolean;
  error: string | null;
}

async function fetchReceipt(digest: string): Promise<TxReceipt> {
  const block = await rpc<{
    effects?: { status?: { status?: string; error?: string } };
    events?: { type: string; parsedJson?: Record<string, unknown> }[];
    objectChanges?: TxReceipt["objectChanges"];
  }>("sui_getTransactionBlock", [digest, { showEffects: true, showEvents: true, showObjectChanges: true }]);
  const ok = block.effects?.status?.status === "success";
  return {
    ok,
    error: ok ? null : block.effects?.status?.error ?? "Transaction failed.",
    events: (block.events ?? []).map((event) => ({ ...event, type: normalizeType(event.type) })),
    objectChanges: (block.objectChanges ?? []).map((change) => ({
      ...change,
      objectType: change.objectType ? normalizeType(change.objectType) : change.objectType,
    })),
  };
}

function fail(error: string): PerpsLaunchResult {
  return { status: "FAILED", digest: null, error, coinType: null, packageId: null, poolId: null, engineId: null };
}

export async function launchOnPerpsplexity(input: PerpsLaunchInput): Promise<PerpsLaunchResult> {
  const market = perpsMarket(input.underlying);
  if (!market) return fail(`Unknown underlying "${input.underlying}". Perpsplexity supports markets like NVDA, TSLA, BTC, ETH, SOL.`);
  const templates = templateModules();
  if (templates.length !== 2) return fail("Perpsplexity coin template is not configured on the backend yet.");
  const keypair = await loadDeployer();
  if (!keypair) return fail("The bot launch wallet is not configured.");
  const sender = keypair.getPublicKey().toSuiAddress();
  let names: { module: string; struct: string };
  try {
    names = deriveNames(input.symbol);
  } catch (error) {
    return fail((error as Error).message);
  }

  let gasPrice = 1000;
  try {
    const { referenceGasPrice } = await import("@/lib/terminal/suipump-launch.server");
    gasPrice = await referenceGasPrice();
  } catch {
    gasPrice = 1000;
  }

  const launchFeeMist = await readLaunchFeeMist().catch(() => null);
  if (launchFeeMist === null) return fail("Could not read the Perpsplexity launch configuration.");

  const gas = await gasCoins(sender);
  const gasTotal = gas.reduce((sum, coin) => sum + BigInt(0), 0n);
  void gasTotal;
  if (gas.length === 0) return fail("The bot wallet has no SUI for gas.");

  const startingCapUnits = input.startingCapUsd && input.startingCapUsd > 0
    ? perpsDecimalUnits(String(Math.round(input.startingCapUsd)), PERPS_MAINNET.quoteDecimals)
    : 0n;
  let virtualQuote = 0n;
  try {
    virtualQuote = perpsVirtualQuote(startingCapUnits, SEED_UNITS);
  } catch (error) {
    return fail((error as Error).message);
  }

  const description = input.description.trim() || `${input.name} — market-backed memecoin on Perpsplexity, launched via OurBlast.`;

  // Step 1 — publish the coin package (official flow publishes the embedded
  // template with patched identifiers, then makes the upgrade cap immutable).
  let modules: string[];
  try {
    modules = [
      templates[0].base64,
      patchIdentifiers(templates[1].base64, names),
    ];
  } catch (error) {
    return fail(`Could not patch the coin template: ${(error as Error).message}`);
  }
  const publishTx = new Transaction();
  withGas(publishTx, sender, gas, gasPrice, PUBLISH_BUDGET);
  const [upgradeCap] = publishTx.publish({
    modules: modules.map((base64) => Array.from(Buffer.from(base64, "base64"))),
    dependencies: ["0x1", "0x2"],
  });
  publishTx.moveCall({ target: "0x2::package::make_immutable", arguments: [upgradeCap] });
  const publishRun = await signAndExecute(publishTx, keypair);
  if (!publishRun.ok || !publishRun.digest) return fail(publishRun.error ?? "Coin package publish failed.");
  const publishReceipt = await fetchReceipt(publishRun.digest);
  if (!publishReceipt.ok) return fail(publishReceipt.error ?? "Coin package publish failed on chain.");
  const creatorCap = publishReceipt.objectChanges.find(
    (change) => change.type === "created" && (change.objectType ?? "").endsWith("::CreatorCap"),
  );
  if (!creatorCap?.objectId || !creatorCap.objectType) return fail("The coin package published but no creator capability appeared.");
  const packageId = creatorCap.objectType.split("::")[0];
  const coinType = `${packageId}::${names.module}::${names.struct}`;

  // Step 2 — prepare the composite pool.
  const capRef = await objectRef(creatorCap.objectId, "The coin creator capability");
  const [registryRef, marketRef, lendingRef, baseOracleRef, collateralOracleRef, launchpadRef, configRef] =
    await Promise.all([
      sharedRef(PERPS_MAINNET.registryId),
      sharedRef(market.marketId),
      sharedRef(PERPS_MAINNET.lendingMarketId),
      sharedRef(market.baseOracleId),
      sharedRef(market.collateralOracleId),
      sharedRef(PERPS_MAINNET.launchpadId),
      sharedRef(PERPS_MAINNET.configId),
    ]);
  const prepareTx = new Transaction();
  withGas(prepareTx, sender, gas, gasPrice, PREPARE_BUDGET);
  const [metadata, treasuryCap] = prepareTx.moveCall({
    target: `${packageId}::${names.module}::create`,
    arguments: [
      prepareTx.objectRef(capRef),
      prepareTx.sharedObjectRef({ objectId: COIN_REGISTRY, initialSharedVersion: "1", mutable: true }),
      prepareTx.pure.string(input.name.trim()),
      prepareTx.pure.string(names.struct),
      prepareTx.pure.string(description),
      prepareTx.pure.string(input.iconUrl),
    ],
  });
  const settings = prepareTx.moveCall({
    target: `${PERPS_MAINNET.packageId}::settings::new`,
    arguments: newSettingsArgs(prepareTx),
  });
  const seed = await usdcSeedCoin(prepareTx, sender, SEED_UNITS);
  const fee = launchFeeMist > 0n
    ? prepareTx.splitCoins(prepareTx.gas, [launchFeeMist])[0]
    : prepareTx.moveCall({ target: "0x2::coin::zero", typeArguments: ["0x2::sui::SUI"] });
  const [poolCap, poolAsset] = prepareTx.moveCall({
    target: `${PERPS_MAINNET.packageId}::launchpad::prepare_composite_registered`,
    typeArguments: [coinType, PERPS_MAINNET.lendingType, PERPS_MAINNET.quoteType],
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
  });
  prepareTx.transferObjects([poolCap, poolAsset], sender);
  const prepareRun = await signAndExecute(prepareTx, keypair);
  if (!prepareRun.ok || !prepareRun.digest) {
    return { status: "FAILED", digest: prepareRun.digest, error: prepareRun.error ?? "Pool preparation failed.", coinType, packageId, poolId: null, engineId: null };
  }
  const prepareReceipt = await fetchReceipt(prepareRun.digest);
  if (!prepareReceipt.ok) {
    return { status: "FAILED", digest: prepareRun.digest, error: prepareReceipt.error ?? "Pool preparation failed on chain.", coinType, packageId, poolId: null, engineId: null };
  }
  const preparedEvent = prepareReceipt.events.find(
    (event) => event.type === `${PERPS_ORIGINAL_PACKAGE_ID}::composite_pool::Prepared`,
  );
  const fields = preparedEvent?.parsedJson as Record<string, string> | undefined;
  if (!fields?.pool || !fields.engine) {
    return { status: "FAILED", digest: prepareRun.digest, error: "The pool prepared but its on-chain receipt was missing.", coinType, packageId, poolId: null, engineId: null };
  }
  if (fields.creator && fields.creator !== sender) {
    return { status: "FAILED", digest: prepareRun.digest, error: "The pool receipt named a different creator wallet.", coinType, packageId, poolId: null, engineId: null };
  }
  const poolCapChange = prepareReceipt.objectChanges.find(
    (change) => change.type === "created" && change.objectType === `${PERPS_ORIGINAL_PACKAGE_ID}::composite_pool::PoolCap`,
  );
  if (!poolCapChange?.objectId) {
    return { status: "FAILED", digest: prepareRun.digest, error: "The pool capability did not reach the launch wallet.", coinType, packageId, poolId: null, engineId: null };
  }

  // Step 3 — activate. First with a 1-unit minimum through a dry run to read
  // the quoted NAV, then for real with a 1% slippage guard (official flow).
  const deadlineMs = Date.now() + ACTIVATE_DEADLINE_MS;
  const buildActivate = async (minimum: bigint) => {
    const refs = await Promise.all([
      sharedRef(fields.pool),
      sharedRef(fields.engine),
      sharedRef(fields.engine_vault),
      sharedRef(fields.engine_account),
      sharedRef(fields.engine_sleeve),
      sharedRef(fields.pool_sleeve),
      sharedRef(fields.reserve),
      sharedRef(fields.reserve_account),
    ]);
    const [poolR, engineR, vaultR, accountR, sleeveR, poolSleeveR, reserveR, reserveAccountR] = refs;
    const freshCap = await objectRef(poolCapChange.objectId!, "The pool capability");
    const tx = new Transaction();
    withGas(tx, sender, gas, gasPrice, ACTIVATE_BUDGET);
    tx.moveCall({
      target: `${PERPS_MAINNET.enginePackageId}::engine::activate`,
      arguments: [
        tx.sharedObjectRef({ ...engineR, mutable: true }),
        tx.sharedObjectRef({ ...vaultR, mutable: true }),
        tx.object(CLOCK),
      ],
    });
    const [clearingHouse, withdrawn] = tx.moveCall({
      target: `${PERPS_MAINNET.packageId}::composite_pool::activate`,
      typeArguments: [coinType, PERPS_MAINNET.lendingType, PERPS_MAINNET.quoteType],
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
    });
    tx.moveCall({
      target: `${PERPS_MAINNET.aftermathPackageId}::clearing_house::share`,
      typeArguments: [PERPS_MAINNET.quoteType],
      arguments: [clearingHouse],
    });
    tx.transferObjects([withdrawn], sender);
    return tx;
  };

  let minimum = 1n;
  try {
    const probeTx = await buildActivate(1n);
    const probeBytes = await probeTx.build();
    const inspected = await rpc<{ events?: { type: string; parsedJson?: { quote_nav?: string } }[] }>(
      "sui_devInspectTransactionBlock",
      [sender, Buffer.from(probeBytes).toString("base64"), null, null],
    );
    const created = (inspected.events ?? []).find(
      (event) => normalizeType(event.type) === `${PERPS_ORIGINAL_PACKAGE_ID}::composite_pool::Created`,
    );
    const nav = created?.parsedJson?.quote_nav;
    if (nav) minimum = (BigInt(nav) * 99n) / 100n;
  } catch {
    minimum = 1n;
  }

  const activateTx = await buildActivate(minimum);
  const activateRun = await signAndExecute(activateTx, keypair);
  if (!activateRun.ok || !activateRun.digest) {
    return { status: "FAILED", digest: activateRun.digest, error: activateRun.error ?? "Activation failed.", coinType, packageId, poolId: fields.pool, engineId: fields.engine };
  }
  const activateReceipt = await fetchReceipt(activateRun.digest);
  if (!activateReceipt.ok) {
    return { status: "FAILED", digest: activateRun.digest, error: activateReceipt.error ?? "Activation failed on chain.", coinType, packageId, poolId: fields.pool, engineId: fields.engine };
  }
  const createdEvent = activateReceipt.events.find(
    (event) => event.type === `${PERPS_ORIGINAL_PACKAGE_ID}::composite_pool::Created`
      && (event.parsedJson as Record<string, unknown> | undefined)?.pool === fields.pool,
  );
  if (!createdEvent) {
    return { status: "FAILED", digest: activateRun.digest, error: "Activation finished without the pool's on-chain confirmation.", coinType, packageId, poolId: fields.pool, engineId: fields.engine };
  }

  return {
    status: "CONFIRMED",
    digest: activateRun.digest,
    error: null,
    coinType,
    packageId,
    poolId: fields.pool,
    engineId: fields.engine,
  };
}
