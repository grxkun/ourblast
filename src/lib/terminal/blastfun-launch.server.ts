/**
 * Blast.fun launch, copied step for step from the official blast.fun launch form
 * (interest-protocol/blast.fun · use-launch-coin.ts, memez-fun-sdk 19.1.0
 * newPoolWithDevRevenueShare) and checked against live mainnet launches such as
 * 7agbUgdTRMUeBjvTTA4d2iPQubfSN1JKCM1Cc5iHfP5A:
 *
 *   1. publish a one-module coin (TreasuryCap + CoinMetadata go to the sender),
 *      then make its upgrade cap immutable;
 *   2. memez_metadata::new → memez_pump_config::new([burnTax, virtualLiquidity,
 *      targetQuoteLiquidity, liquidityProvision, totalSupply]) →
 *      memez_router::new_with_developer_stake_holder → share the pool, keep the
 *      MetadataCap.
 *
 * No developer buy, zero creation fee coin — exactly as the form sends it.
 */
import { Transaction } from "@mysten/sui/transactions";

import { patchBlastfunTemplate } from "./blastfun-template.server";
import {
  gasCoins,
  loadDeployer,
  normalizeType,
  referenceGasPrice,
  rpc,
  signAndExecute,
  withGas,
} from "./suipump-launch.server";

// Mainnet objects from @interest-protocol/memez-fun-sdk 19.1.0 (SHARED_OBJECTS / PACKAGES).
const MEMEZ_FUN_LATEST = "0x7e6aa6e179466ab2814425a780b122575296d011119fa69d27f289f5a28814bd";
const MEMEZ_FUN_ORIGINAL = "0x779829966a2e8642c310bed79e6ba603e5acd3c31b25d7d4511e2c9303d6e3ef";
const ROUTER_LATEST = "0xa36cd2f2ab1d47c884cf564df780691a461e05bda1db1528772f8d0694cb184d";
const CONFIG_KEY = "0x5afcb4c691bd3af2eb5de4c416b2ed501e843e81209f83ce6928bc3a10d0205c::xpump::ConfigKey";
const MIGRATION_WITNESS = "0x7ec68f4115dc2944426239b13ce6804dd9971b24069fb4efe88360d29b17f0ce::xpump_migrator::Witness";
const WALLET_REGISTRY = { objectId: "0xc6ed6d218aff361ed293ba3eaf2805772275c9dc87f650a0f8df9c80471c5fbe", initialSharedVersion: "611022341" };
const CONFIG = { objectId: "0x9c665993f61a902475b083036da75240aa203bb874ebce4031810b589e485a61", initialSharedVersion: "597477043" };
const VERSION = { objectId: "0x2319e3e76dfad73d8f4684bdbf42be4f32d8ce4521dd61becc8261dc918d82c0", initialSharedVersion: "597477043" };
const SUI = "0x2::sui::SUI";

// blast.fun/src/constants: TOTAL_POOL_SUPPLY, VIRTUAL_LIQUIDITY, TARGET_QUOTE_LIQUIDITY, BASE_LIQUIDITY_PROVISION.
const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 9n;
const VIRTUAL_LIQUIDITY = 500n * 10n ** 9n;
const TARGET_QUOTE_LIQUIDITY = 2_500n * 10n ** 9n;
const LIQUIDITY_PROVISION = 1_350n;
const BURN_TAX = 0n;

/** The coin package Blast.fun published for its own first launch (immutable). */
const TEMPLATE_PACKAGE = "0x106a61f8bae751fbd955e957431ab73a595784ce97bf4e30138b92c939209ca4";
const TEMPLATE_NAMES = { module: "blast", struct: "BLAST" };
const PUBLISH_BUDGET = 200_000_000;
const POOL_BUDGET = 300_000_000;
const BLACKLIST = ["SUI", "ETH", "USDC", "USDT", "SOL", "BNB", "WBNB", "WETH", "BTC", "WBTC"];
const MOVE_KEYWORDS = new Set(["abort", "acquires", "as", "break", "const", "continue", "copy", "else", "false", "fun", "friend", "if", "let", "loop", "module", "move", "mut", "native", "public", "return", "struct", "true", "use", "while", "enum", "match", "type"]);

export interface BlastfunLaunchInput {
  symbol: string;
  name: string;
  description: string;
  iconUrl: string;
  xLink: string | null;
  website?: string | null;
  telegram?: string | null;
}

export interface BlastfunLaunchResult {
  status: "CONFIRMED" | "FAILED";
  error: string | null;
  coinType: string | null;
  poolId: string | null;
  digest: string | null;
}

const fail = (error: string, extra: Partial<BlastfunLaunchResult> = {}): BlastfunLaunchResult => ({
  status: "FAILED", error, coinType: null, poolId: null, digest: null, ...extra,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function receipt(digest: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const block = await rpc<{
      effects?: { status?: { status?: string; error?: string } };
      objectChanges?: { type: string; objectId?: string; objectType?: string; version?: string; digest?: string }[];
    }>("sui_getTransactionBlock", [digest, { showEffects: true, showObjectChanges: true }]).catch(() => null);
    const status = block?.effects?.status?.status;
    if (status) {
      return {
        ok: status === "success",
        error: block?.effects?.status?.error ?? null,
        created: (block?.objectChanges ?? [])
          .filter((c) => c.type === "created" && c.objectId && c.objectType)
          .map((c) => ({ objectId: c.objectId!, objectType: normalizeType(c.objectType!), version: String(c.version), digest: c.digest! })),
      };
    }
    await sleep(1500);
  }
  return { ok: false, error: "Transaction not visible on chain.", created: [] };
}

async function templateModule(): Promise<Uint8Array> {
  const result = await rpc<{ data?: { bcs?: { moduleMap?: Record<string, string> } } }>("sui_getObject", [
    TEMPLATE_PACKAGE,
    { showBcs: true },
  ]);
  const module = result.data?.bcs?.moduleMap?.[TEMPLATE_NAMES.module];
  if (!module) throw new Error("Could not read the Blast.fun coin template from chain.");
  return new Uint8Array(Buffer.from(module, "base64"));
}

async function freshGas(sender: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const coins = await gasCoins(sender).catch(() => []);
    if (coins.length > 0) return coins;
    await sleep(1500);
  }
  return [];
}

export async function launchOnBlastfun(input: BlastfunLaunchInput): Promise<BlastfunLaunchResult> {
  const symbol = input.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(symbol)) return fail("Ticker must be 2–10 letters/digits starting with a letter.");
  const name = input.name.trim() || symbol;
  if (BLACKLIST.includes(symbol) || BLACKLIST.includes(name.toUpperCase())) return fail("Blast.fun does not allow that name or ticker.");
  let module = symbol.toLowerCase();
  if (MOVE_KEYWORDS.has(module)) module = `${module}_coin`;

  const keypair = await loadDeployer();
  if (!keypair) return fail("The bot launch wallet is not configured.");
  const sender = keypair.getPublicKey().toSuiAddress();
  const gasPrice = await referenceGasPrice().catch(() => 1000);

  // Step 1 — publish the coin.
  let bytes: Uint8Array;
  try {
    bytes = patchBlastfunTemplate(await templateModule(), TEMPLATE_NAMES, {
      module,
      struct: symbol,
      symbol,
      name: name.slice(0, 64),
      description: input.description.trim().slice(0, 500) || `${name} — launched on Blast.fun via OurBlast.`,
      iconUrl: input.iconUrl,
    });
  } catch (error) {
    return fail(`Could not prepare the coin: ${(error as Error).message}`);
  }
  const gas = await freshGas(sender);
  if (gas.length === 0) return fail("The bot wallet has no SUI for gas.");
  const publishTx = new Transaction();
  withGas(publishTx, sender, gas, gasPrice, PUBLISH_BUDGET);
  const [upgradeCap] = publishTx.publish({ modules: [Array.from(bytes)], dependencies: ["0x" + "1".padStart(64, "0"), "0x" + "2".padStart(64, "0")] });
  publishTx.moveCall({ target: "0x2::package::make_immutable", arguments: [upgradeCap!] });
  const published = await signAndExecute(publishTx, keypair);
  if (!published.ok || !published.digest) return fail(published.error ?? "Coin publish failed.");
  const publishReceipt = await receipt(published.digest);
  if (!publishReceipt.ok) return fail(publishReceipt.error ?? "Coin publish failed on chain.");
  const treasury = publishReceipt.created.find((c) => c.objectType.includes("::coin::TreasuryCap<"));
  const metadata = publishReceipt.created.find((c) => c.objectType.includes("::coin::CoinMetadata<"));
  if (!treasury || !metadata) return fail("The coin published but its treasury or metadata did not appear.");
  const coinType = treasury.objectType.slice(treasury.objectType.indexOf("<") + 1, -1);

  // Step 2 — create the Blast.fun bonding curve pool.
  const poolGas = await freshGas(sender);
  const tx = new Transaction();
  withGas(tx, sender, poolGas, gasPrice, POOL_BUDGET);
  const creationFee = tx.moveCall({ target: "0x2::coin::zero", typeArguments: [SUI] });
  const links: Record<string, string> = {};
  if (input.xLink) links["X"] = input.xLink;
  if (input.website) links["Website"] = input.website;
  if (input.telegram) links["Telegram"] = input.telegram;
  const memezMetadata = tx.moveCall({
    target: `${MEMEZ_FUN_LATEST}::memez_metadata::new`,
    typeArguments: [coinType],
    arguments: [
      tx.objectRef({ objectId: metadata.objectId, version: metadata.version, digest: metadata.digest }),
      tx.pure.vector("string", Object.keys(links)),
      tx.pure.vector("string", Object.values(links)),
    ],
  });
  const pumpConfig = tx.moveCall({
    target: `${MEMEZ_FUN_LATEST}::memez_pump_config::new`,
    arguments: [tx.pure.vector("u64", [BURN_TAX, VIRTUAL_LIQUIDITY, TARGET_QUOTE_LIQUIDITY, LIQUIDITY_PROVISION, TOTAL_SUPPLY])],
  });
  const quoteZero = tx.moveCall({ target: "0x2::coin::zero", typeArguments: [SUI] });
  const versions = tx.moveCall({
    target: `${MEMEZ_FUN_LATEST}::memez_allowed_versions::get_allowed_versions`,
    arguments: [tx.sharedObjectRef({ ...VERSION, mutable: false })],
  });
  const [pool, metadataCap] = tx.moveCall({
    target: `${ROUTER_LATEST}::memez_router::new_with_developer_stake_holder`,
    typeArguments: [coinType, SUI, CONFIG_KEY, MIGRATION_WITNESS],
    arguments: [
      tx.sharedObjectRef({ ...WALLET_REGISTRY, mutable: true }),
      tx.sharedObjectRef({ ...CONFIG, mutable: false }),
      tx.objectRef({ objectId: treasury.objectId, version: treasury.version, digest: treasury.digest }),
      creationFee,
      pumpConfig,
      quoteZero,
      memezMetadata,
      tx.pure.bool(false),
      versions,
    ],
  });
  tx.moveCall({
    target: "0x2::transfer::public_share_object",
    typeArguments: [`${MEMEZ_FUN_ORIGINAL}::memez_fun::MemezFun<${MEMEZ_FUN_ORIGINAL}::memez_pump::Pump, ${coinType}, ${SUI}>`],
    arguments: [pool!],
  });
  tx.transferObjects([metadataCap!], tx.pure.address(sender));
  const created = await signAndExecute(tx, keypair);
  if (!created.ok || !created.digest) return fail(created.error ?? "Blast.fun pool creation failed.", { coinType });
  const poolReceipt = await receipt(created.digest);
  if (!poolReceipt.ok) return fail(poolReceipt.error ?? "Blast.fun pool creation failed on chain.", { coinType, digest: created.digest });
  const poolObject = poolReceipt.created.find((c) => c.objectType.includes("::memez_fun::MemezFun<") && c.objectType.includes("::memez_pump::Pump"));
  if (!poolObject) return fail("The transaction succeeded but no Blast.fun pool appeared.", { coinType, digest: created.digest });
  return { status: "CONFIRMED", error: null, coinType, poolId: poolObject.objectId, digest: created.digest };
}
