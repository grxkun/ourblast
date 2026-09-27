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
  PERPSPLEXITY_CURVE_DEFAULT_CAP_UNITS,
  PERPSPLEXITY_CURVE_HIBERNATION,
  PERPSPLEXITY_CURVE_QUOTE_DECIMALS,
  PERPSPLEXITY_CURVE_QUOTE_TYPE,
  PERPSPLEXITY_CURVE_SEED_UNITS,
  PERPSPLEXITY_CURVE_SUPPLY,
  PERPSPLEXITY_LAUNCHPAD_ID,
  PERPSPLEXITY_ORIGINAL_PACKAGE_ID,
  PERPSPLEXITY_PACKAGE_ID,
  perpsCurveVirtualQuote,
  perpsQuoteUnits,
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
  /** Starting market cap in USD; the curve is quoted in USDC, so 1:1. */
  startingCapUsd?: number | null;
  /** The launcher's own first buy on the new curve, in USDC. 0/null = none. */
  devBuyUsdc?: number | null;
}

export interface PerpsLaunchResult {
  status: "CONFIRMED" | "FAILED";
  digest: string | null;
  error: string | null;
  coinType: string | null;
  packageId: string | null;
  poolId: string | null;
  engineId: string | null;
  /** Set when an initial buy was requested and went through. */
  devBuyDigest?: string | null;
  /** Set when the launch confirmed but the initial buy did not. */
  devBuyError?: string | null;
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
const BUY_BUDGET = 300_000_000;
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

/**
 * Starting market cap in USDC base units. The curve is quoted in USDC, so a
 * requested USD cap is the cap — no price conversion is involved.
 */
function startingCapUnits(startingCapUsd: number | null | undefined): bigint {
  if (!startingCapUsd || startingCapUsd <= 0) return PERPSPLEXITY_CURVE_DEFAULT_CAP_UNITS;
  const units = perpsQuoteUnits(startingCapUsd.toFixed(PERPSPLEXITY_CURVE_QUOTE_DECIMALS));
  return units > PERPSPLEXITY_CURVE_SEED_UNITS ? units : PERPSPLEXITY_CURVE_DEFAULT_CAP_UNITS;
}

interface OwnedCoin {
  coinObjectId: string;
  version: string;
  digest: string;
  balance: string;
}

/** The wallet's USDC coin objects, largest first. */
async function quoteCoins(owner: string): Promise<OwnedCoin[]> {
  const result = await rpc<{ data?: OwnedCoin[] }>("suix_getCoins", [
    owner,
    PERPSPLEXITY_CURVE_QUOTE_TYPE,
    null,
    50,
  ]).catch(() => ({ data: [] as OwnedCoin[] }));
  return (result.data ?? []).slice().sort((a, b) => (BigInt(b.balance) > BigInt(a.balance) ? 1 : -1));
}

const quoteAmountText = (units: bigint) => (Number(units) / 10 ** PERPSPLEXITY_CURVE_QUOTE_DECIMALS).toString();

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

/**
 * The launcher's first buy on a live curve. Mirrors the pad's own buy
 * transaction: split the USDC amount, call pool::buy, keep the Position.
 */
async function buyOnCurve(args: {
  keypair: NonNullable<Awaited<ReturnType<typeof loadDeployer>>>;
  sender: string;
  coinType: string;
  poolId: string;
  amount: bigint;
  gasPrice: number;
  freshGas: () => Promise<Awaited<ReturnType<typeof gasCoins>>>;
}): Promise<{ digest: string | null; error: string | null }> {
  try {
    const gas = await args.freshGas();
    if (gas.length === 0) return { digest: null, error: "No SUI coin was left to pay gas for the first buy." };
    const coins = await quoteCoins(args.sender);
    const primary = coins[0];
    if (!primary) return { digest: null, error: "The wallet held no USDC for the first buy." };
    const [poolRef, configRef, clockRef] = await Promise.all([
      sharedRef(args.poolId),
      sharedRef(PERPSPLEXITY_CONFIG_ID),
      sharedRef(CLOCK),
    ]);
    const tx = new Transaction();
    withGas(tx, args.sender, gas, args.gasPrice, BUY_BUDGET);
    const source = tx.objectRef({
      objectId: primary.coinObjectId,
      version: primary.version,
      digest: primary.digest,
    });
    if (BigInt(primary.balance) < args.amount && coins.length > 1) {
      tx.mergeCoins(
        source,
        coins
          .slice(1)
          .map((coin) => tx.objectRef({ objectId: coin.coinObjectId, version: coin.version, digest: coin.digest })),
      );
    }
    const [payment] = tx.splitCoins(source, [tx.pure.u64(args.amount)]);
    const position = tx.moveCall({
      target: `${PERPSPLEXITY_PACKAGE_ID}::pool::buy`,
      typeArguments: [args.coinType, PERPSPLEXITY_CURVE_QUOTE_TYPE],
      arguments: [
        tx.sharedObjectRef({ ...poolRef, mutable: true }),
        tx.sharedObjectRef({ ...configRef, mutable: false }),
        payment!,
        // No slippage floor: this is the very first trade on a fresh curve.
        tx.pure.u64(0),
        tx.pure.u64(BigInt(Date.now() + 300_000)),
        tx.sharedObjectRef({ ...clockRef, mutable: false }),
      ],
    });
    tx.transferObjects([position], args.sender);
    const run = await signAndExecute(tx, args.keypair);
    if (!run.ok || !run.digest) return { digest: null, error: run.error ?? "The first buy failed." };
    const receipt = await fetchReceipt(run.digest);
    if (!receipt.ok) return { digest: run.digest, error: receipt.error ?? "The first buy failed on chain." };
    return { digest: run.digest, error: null };
  } catch (error) {
    return { digest: null, error: (error as Error).message };
  }
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
    virtualQuote = perpsCurveVirtualQuote(startingCapUnits(input.startingCapUsd));
  } catch (error) {
    return fail((error as Error).message);
  }

  // The curve is seeded in USDC, so the bot wallet must hold the 1 USDC seed
  // plus whatever initial buy was requested.
  const devBuyUnits =
    input.devBuyUsdc && input.devBuyUsdc > 0
      ? perpsQuoteUnits(input.devBuyUsdc.toFixed(PERPSPLEXITY_CURVE_QUOTE_DECIMALS))
      : 0n;
  const quoteNeeded = PERPSPLEXITY_CURVE_SEED_UNITS + devBuyUnits;
  const quoteHeld = await quoteCoins(sender);
  const quoteBalance = quoteHeld.reduce((total, coin) => total + BigInt(coin.balance), 0n);
  if (quoteBalance < quoteNeeded) {
    return fail(
      `The bot wallet needs ${quoteAmountText(quoteNeeded)} USDC for the 1 USDC pool seed${
        devBuyUnits > 0n ? ` and the ${quoteAmountText(devBuyUnits)} USDC first buy` : ""
      }; it holds ${quoteAmountText(quoteBalance)} USDC.`,
    );
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
  // Only the launch fee and gas come out of SUI now; the pool seed is USDC.
  const needed = launchFeeMist + GAS_HEADROOM_MIST;
  const balance = await rpc<{ totalBalance?: string }>("suix_getBalance", [sender, "0x2::sui::SUI"])
    .then((result) => BigInt(result.totalBalance ?? "0"))
    .catch(() => 0n);
  if (balance > 0n && balance < needed) {
    return fail(
      `The bot wallet needs about ${Number(needed) / 1_000_000_000} SUI for the ${Number(launchFeeMist) / 1_000_000_000} SUI launch fee and gas.`,
      { coinType, packageId },
    );
  }
  // Fresh USDC coin references: the balance check above ran before the publish.
  const seedSource = await quoteCoins(sender);
  const seedPrimary = seedSource[0];
  if (!seedPrimary) return fail("The bot wallet holds no USDC to seed the curve.", { coinType, packageId });

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
  // The launch fee is paid in SUI off the gas coin; the 1 USDC pool seed is
  // split off the wallet's own USDC, exactly as the official launch form does.
  const [feeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(launchFeeMist)]);
  const primaryQuote = tx.objectRef({
    objectId: seedPrimary.coinObjectId,
    version: seedPrimary.version,
    digest: seedPrimary.digest,
  });
  if (BigInt(seedPrimary.balance) < PERPSPLEXITY_CURVE_SEED_UNITS && seedSource.length > 1) {
    tx.mergeCoins(
      primaryQuote,
      seedSource
        .slice(1)
        .map((coin) => tx.objectRef({ objectId: coin.coinObjectId, version: coin.version, digest: coin.digest })),
    );
  }
  const [seedCoin] = tx.splitCoins(primaryQuote, [tx.pure.u64(PERPSPLEXITY_CURVE_SEED_UNITS)]);
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

  // Step 3 — the creator's own first buy, when one was requested. The pool is
  // only shared by the launch call, so this is a follow-up transaction against
  // the confirmed pool: pool::buy<COIN, USDC>(pool, config, coin, min_out,
  // deadline_ms, clock) → Position, kept by the launch wallet. A failure here
  // never invalidates the launch; the curve is already live.
  let devBuyDigest: string | null = null;
  let devBuyError: string | null = null;
  if (devBuyUnits > 0n) {
    const outcome = await buyOnCurve({
      keypair,
      sender,
      coinType,
      poolId,
      amount: devBuyUnits,
      gasPrice,
      freshGas,
    });
    devBuyDigest = outcome.digest;
    devBuyError = outcome.error;
  }

  return {
    status: "CONFIRMED",
    digest: run.digest,
    error: null,
    coinType,
    packageId,
    poolId,
    engineId: null,
    devBuyDigest,
    devBuyError,
  };
}
