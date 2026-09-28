/**
 * OurBlast launch path for Maelstrom (maelstromfun.xyz), traced from the real
 * STROM launch (publish 6WnjePhYLWyKDBrZ3jwAXF4pxRPj4kkp32H8Sht5w95j, launch
 * 5vyM8ktXzWDK1NWR2JExBt1k78izPmFeSuEV8fg6NVUT) and from Maelstrom's own launch
 * client:
 *
 *   1. Publish the patched coin template + 0x2::package::make_immutable. Its
 *      init registers the currency, mints the whole 1B supply to the sender,
 *      makes the supply burn-only and deletes the metadata cap (metadata frozen).
 *   2. One atomic transaction: split the pool seed and the launchpad's launch fee
 *      off the gas coin → launchpad::launch_as_a / launch_as_b → Cetus pool is
 *      created, the whole float is added as liquidity, and the LP position is
 *      locked by the locker package in the same Move call.
 *
 * Nothing is reported as launched until Sui confirms the transaction and emits
 * launchpad::Launched.
 */
import { Transaction } from "@mysten/sui/transactions";

import {
  CETUS_GLOBAL_CONFIG_ID,
  CETUS_POOLS_ID,
  MAELSTROM_COIN_DECIMALS,
  MAELSTROM_COIN_SUPPLY,
  MAELSTROM_EVENT_LAUNCHED,
  MAELSTROM_FEE_ROUTES,
  MAELSTROM_LAUNCHPAD_ID,
  MAELSTROM_ORIGINAL_PACKAGE_ID,
  MAELSTROM_PACKAGE_ID,
  MAELSTROM_QUOTES,
  MAELSTROM_START_FDV_USD,
  MAELSTROM_TEMPLATE_NAMES,
  MAELSTROM_TEMPLATE_PACKAGE,

  SUI_TYPE,
  boundaryTickFor,
  buildLaunchMetadata,
  coinSortsAsA,
  feeRateOf,
  launchDeposit,
  minimumSeed,
  previewLaunch,
} from "./maelstrom";
import { patchMaelstromTemplate } from "./maelstrom-template.server";
import {
  gasCoins,
  loadDeployer,
  normalizeType,
  referenceGasPrice,
  rpc,
  sharedRef,
  signAndExecute,
  withGas,
} from "./suipump-launch.server";

const CLOCK = "0x6";
const PUBLISH_BUDGET = 300_000_000;
const LAUNCH_BUDGET = 900_000_000;
/** Gas headroom kept on top of the seed and the launch fee. */
const GAS_HEADROOM_MIST = 1_000_000_000n;
/** Pool shape: 220 tick spacing → Cetus 2% fee tier, the launchpad default. */
const TICK_SPACING = 220;
/** No premine: OurBlast never takes a creator allocation. */
const CREATOR_BPS = 0;
const MOVE_KEYWORDS = new Set(
  "abort.acquires.as.break.const.continue.copy.else.entry.enum.false.friend.fun.has.if.invariant.let.loop.macro.match.module.move.mut.native.public.return.script.spec.struct.true.type.use.while".split("."),
);

export interface MaelstromLaunchInput {
  symbol: string;
  name: string;
  description: string;
  iconUrl: string;
  website?: string | null;
  xLink?: string | null;
  telegram?: string | null;
  /** Where collected LP fees go; defaults to the launch wallet's own route. */
  feeRecipient?: string | null;
  /** Quote symbol from MAELSTROM_QUOTES; defaults to SUI. */
  quote?: string | null;
}

export interface MaelstromLaunchResult {
  status: "CONFIRMED" | "FAILED";
  error: string | null;
  digest: string | null;
  coinType: string | null;
  poolId: string | null;
  positionId: string | null;
  launchId: string | null;
}

const fail = (error: string, extra: Partial<MaelstromLaunchResult> = {}): MaelstromLaunchResult => ({
  status: "FAILED",
  error,
  digest: null,
  coinType: null,
  poolId: null,
  positionId: null,
  launchId: null,
  ...extra,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Receipt {
  ok: boolean;
  error: string | null;
  created: { objectId: string; objectType: string; version: string; digest: string }[];
  events: { type: string; parsedJson: Record<string, unknown> }[];
}

async function receipt(digest: string): Promise<Receipt> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const block = await rpc<{
      effects?: { status?: { status?: string; error?: string } };
      events?: { type?: string; parsedJson?: Record<string, unknown> }[];
      objectChanges?: { type: string; objectId?: string; objectType?: string; version?: string; digest?: string }[];
    }>("sui_getTransactionBlock", [
      digest,
      { showEffects: true, showEvents: true, showObjectChanges: true },
    ]).catch(() => null);
    const status = block?.effects?.status?.status;
    if (status) {
      return {
        ok: status === "success",
        error: status === "success" ? null : block?.effects?.status?.error ?? "Transaction failed.",
        created: (block?.objectChanges ?? [])
          .filter((change) => change.type === "created" && change.objectId && change.objectType)
          .map((change) => ({
            objectId: change.objectId as string,
            objectType: normalizeType(change.objectType as string),
            version: String(change.version),
            digest: change.digest as string,
          })),
        events: (block?.events ?? [])
          .filter((event) => typeof event.type === "string")
          .map((event) => ({ type: normalizeType(event.type as string), parsedJson: event.parsedJson ?? {} })),
      };
    }
    await sleep(1500);
  }
  return { ok: false, error: "Transaction not visible on chain.", created: [], events: [] };
}

async function templateModule(): Promise<Uint8Array> {
  const result = await rpc<{ data?: { bcs?: { moduleMap?: Record<string, string> } } }>("sui_getObject", [
    MAELSTROM_TEMPLATE_PACKAGE,
    { showBcs: true },
  ]);
  const module = result.data?.bcs?.moduleMap?.[MAELSTROM_TEMPLATE_NAMES.module];
  if (!module) throw new Error("Could not read the Maelstrom coin template from chain.");
  return new Uint8Array(Buffer.from(module, "base64"));
}

/** Live launchpad settings: launch fee, creator fee split, allowed pool shapes. */
async function launchpadSettings(): Promise<{ launchFee: bigint; creatorFeeBps: number; tickSpacings: number[] }> {
  const result = await rpc<{
    data?: {
      content?: {
        fields?: {
          paused?: boolean;
          launch_fee?: string;
          creator_fee_bps?: string;
          tick_spacings?: { fields?: { contents?: number[] } };
        };
      } | null;
    };
  }>("sui_getObject", [MAELSTROM_LAUNCHPAD_ID, { showContent: true }]);
  const fields = result.data?.content?.fields;
  if (!fields) throw new Error("Could not read the Maelstrom launchpad settings.");
  if (fields.paused) throw new Error("Maelstrom launches are paused right now.");
  return {
    launchFee: BigInt(fields.launch_fee ?? "0"),
    creatorFeeBps: Number(fields.creator_fee_bps ?? "0"),
    tickSpacings: fields.tick_spacings?.fields?.contents ?? [TICK_SPACING],
  };
}

/** Live SUI spot price, used only to translate the $4K opening cap into SUI. */
async function suiUsdPrice(coinType = SUI_TYPE): Promise<number> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${coinType}`, {
      headers: { accept: "application/json" },
    });
    const json = (await res.json()) as {
      pairs?: { chainId?: string; priceUsd?: string; liquidity?: { usd?: number }; baseToken?: { address?: string } }[];
    };
    let best = 0;
    let deepest = 0;
    const tail = coinType.split("::").slice(1).join("::").toLowerCase();
    for (const pair of json.pairs ?? []) {
      if (pair.chainId !== "sui") continue;
      // priceUsd is the base token's price: skip pairs where our coin is the quote.
      const base = (pair.baseToken?.address ?? "").toLowerCase();
      if (base && !base.endsWith(tail)) continue;
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

async function freshGas(sender: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const coins = await gasCoins(sender).catch(() => []);
    if (coins.length > 0) return coins;
    await sleep(1500);
  }
  return [];
}

export async function launchOnMaelstrom(input: MaelstromLaunchInput): Promise<MaelstromLaunchResult> {
  const symbol = input.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(symbol)) {
    return fail("Ticker must be 2–10 letters/digits starting with a letter.");
  }
  const name = input.name.trim().slice(0, 64) || symbol;
  let module = symbol.toLowerCase();
  if (MOVE_KEYWORDS.has(module)) module = `${module}_coin`;

  const keypair = await loadDeployer();
  if (!keypair) return fail("The bot launch wallet is not configured.");
  const sender = keypair.getPublicKey().toSuiAddress();

  let settings: Awaited<ReturnType<typeof launchpadSettings>>;
  try {
    settings = await launchpadSettings();
  } catch (error) {
    return fail((error as Error).message);
  }
  const tickSpacing = settings.tickSpacings.includes(TICK_SPACING)
    ? TICK_SPACING
    : (settings.tickSpacings[0] as number);

  const quoteSymbol = (input.quote ?? "SUI").toUpperCase();
  const quote = MAELSTROM_QUOTES[quoteSymbol];
  if (!quote) return fail(`${quoteSymbol} is not a supported Maelstrom pair. Use SUI, USDC, BLAST, DEEP or WAL.`);
  const quoteType = quote.type;
  const isSuiQuote = quoteType === SUI_TYPE;
  const suiPrice = quoteSymbol === "USDC" ? 1 : await suiUsdPrice(quoteType);
  if (suiPrice <= 0) {
    return fail(`No ${quoteSymbol} price is available right now, so the opening valuation cannot be set. Try again shortly.`);
  }

  const gasPrice = await referenceGasPrice().catch(() => 1000);

  // Step 1 — publish the coin. Its init mints the whole supply to the sender and
  // freezes the metadata, exactly like a launch made on the site.
  let bytes: Uint8Array;
  try {
    bytes = patchMaelstromTemplate(await templateModule(), MAELSTROM_TEMPLATE_NAMES, {
      module,
      struct: symbol,
      symbol,
      name,
      description:
        input.description.trim().slice(0, 280) || `${name} — launched on Maelstrom via OurBlast.`,
      iconUrl: tokenIconUrl(input.iconUrl).slice(0, 300),
    });
  } catch (error) {
    return fail(`Could not prepare the coin: ${(error as Error).message}`);
  }

  const publishGas = await freshGas(sender);
  if (publishGas.length === 0) return fail("The bot wallet has no SUI coin left to pay gas.");
  const publishTx = new Transaction();
  withGas(publishTx, sender, publishGas, gasPrice, PUBLISH_BUDGET);
  const [upgradeCap] = publishTx.publish({
    modules: [Array.from(bytes)],
    dependencies: [
      "0x0000000000000000000000000000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000000000000000000000000000002",
    ],
  });
  publishTx.moveCall({ target: "0x2::package::make_immutable", arguments: [upgradeCap!] });
  const publishRun = await signAndExecute(publishTx, keypair);
  if (!publishRun.ok || !publishRun.digest) return fail(publishRun.error ?? "Coin publish failed.");
  const publishReceipt = await receipt(publishRun.digest);
  if (!publishReceipt.ok) return fail(publishReceipt.error ?? "Coin publish failed on chain.");
  const supplyCoin = publishReceipt.created.find((change) => /^0x2::coin::Coin<.+>$/.test(change.objectType));
  if (!supplyCoin) return fail("The coin published but its supply did not appear in the launch wallet.");
  const coinType = normalizeType(supplyCoin.objectType.replace(/^0x2::coin::Coin<(.+)>$/, "$1"));
  const packageId = coinType.split("::")[0]!;

  // Step 2 — the launch: Cetus pool, liquidity, lock, all in one Move call.
  let coinIsA: boolean;
  let preview: ReturnType<typeof previewLaunch>;
  let seed: bigint;
  let boundaryTick: number;
  try {
    coinIsA = coinSortsAsA(coinType, quoteType);
    boundaryTick = boundaryTickFor({
      coinIsA,
      coinDecimals: MAELSTROM_COIN_DECIMALS,
      quoteDecimals: quote.decimals,
      supply: Number(MAELSTROM_COIN_SUPPLY / 10n ** BigInt(MAELSTROM_COIN_DECIMALS)),
      startFdvInQuote: MAELSTROM_START_FDV_USD / suiPrice,
      tickSpacing,
    });
    const base = {
      coinIsA,
      supply: MAELSTROM_COIN_SUPPLY,
      creatorBps: CREATOR_BPS,
      tickSpacing,
      boundaryTick,
      feeRate: feeRateOf(tickSpacing),
      creatorFeeBps: settings.creatorFeeBps,
    };
    seed = launchDeposit(minimumSeed(base));
    preview = previewLaunch({ ...base, seed });
  } catch (error) {
    return fail(`Could not price the pool: ${(error as Error).message}`, { coinType, digest: publishRun.digest });
  }

  // Non-SUI pools are seeded from the bot wallet's own quote coins.
  let quoteCoins: { coinObjectId: string; version: string; digest: string; balance: string }[] = [];
  if (!isSuiQuote) {
    quoteCoins = await rpc<{ data: typeof quoteCoins }>("suix_getCoins", [sender, quoteType, null, 50])
      .then((r) => r.data ?? [])
      .catch(() => []);
    const held = quoteCoins.reduce((sum, c) => sum + BigInt(c.balance), 0n);
    if (held < seed) {
      return fail(
        `The bot wallet needs a little ${quoteSymbol} (${Number(seed) / 10 ** quote.decimals}) to seed a ${symbol}/${quoteSymbol} pool.`,
        { coinType, digest: publishRun.digest },
      );
    }
  }
  const needed = (isSuiQuote ? seed : 0n) + settings.launchFee + GAS_HEADROOM_MIST;
  const balance = await rpc<{ totalBalance?: string }>("suix_getBalance", [sender, SUI_TYPE])
    .then((result) => BigInt(result.totalBalance ?? "0"))
    .catch(() => 0n);
  if (balance > 0n && balance < needed) {
    return fail(
      `The bot wallet needs about ${Number(needed) / 1e9} SUI for the pool seed, the ${
        Number(settings.launchFee) / 1e9
      } SUI launch fee and gas.`,
      { coinType, digest: publishRun.digest },
    );
  }

  const [launchpadRef, cetusConfigRef, cetusPoolsRef, clockRef, launchGas] = await Promise.all([
    sharedRef(MAELSTROM_LAUNCHPAD_ID),
    sharedRef(CETUS_GLOBAL_CONFIG_ID),
    sharedRef(CETUS_POOLS_ID),
    sharedRef(CLOCK),
    freshGas(sender),
  ]);
  if (launchGas.length === 0) {
    return fail("The bot wallet has no SUI coin left to pay gas.", { coinType, digest: publishRun.digest });
  }

  const metadata = buildLaunchMetadata({
    website: input.website ?? null,
    twitter: input.xLink ?? null,
    telegram: input.telegram ?? null,
  });
  const feeRecipient = input.feeRecipient?.trim() ? input.feeRecipient.trim() : sender;

  const tx = new Transaction();
  withGas(tx, sender, launchGas, gasPrice, LAUNCH_BUDGET);
  let seedCoin;
  let feeCoin;
  if (isSuiQuote) {
    [seedCoin, feeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(seed), tx.pure.u64(settings.launchFee)]);
  } else {
    const refs = quoteCoins.map((c) => tx.objectRef({ objectId: c.coinObjectId, version: String(c.version), digest: c.digest }));
    const primary = refs[0]!;
    if (refs.length > 1) tx.mergeCoins(primary, refs.slice(1));
    [seedCoin] = tx.splitCoins(primary, [tx.pure.u64(seed)]);
    [feeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(settings.launchFee)]);
  }
  tx.moveCall({
    target: `${MAELSTROM_PACKAGE_ID}::launchpad::${coinIsA ? "launch_as_a" : "launch_as_b"}`,
    typeArguments: [coinType, quoteType],
    arguments: [
      tx.sharedObjectRef({ ...launchpadRef, mutable: true }),
      tx.sharedObjectRef({ ...cetusConfigRef, mutable: false }),
      tx.sharedObjectRef({ ...cetusPoolsRef, mutable: true }),
      tx.objectRef({ objectId: supplyCoin.objectId, version: supplyCoin.version, digest: supplyCoin.digest }),
      seedCoin!,
      feeCoin!,
      tx.pure.u32(tickSpacing),
      tx.pure.u32(preview.boundaryTickU32),
      tx.pure.u64(CREATOR_BPS),
      tx.pure.u8(MAELSTROM_FEE_ROUTES.wallet),
      tx.pure.address(feeRecipient),
      tx.pure.u64(0),
      tx.pure.string(metadata),
      tx.sharedObjectRef({ ...clockRef, mutable: false }),
    ],
  });

  const run = await signAndExecute(tx, keypair);
  if (!run.ok || !run.digest) {
    return fail(run.error ?? "The Maelstrom launch failed.", { coinType, digest: run.digest });
  }
  const launchReceipt = await receipt(run.digest);
  if (!launchReceipt.ok) {
    return fail(launchReceipt.error ?? "The Maelstrom launch failed on chain.", { coinType, digest: run.digest });
  }
  const launched = launchReceipt.events.find((event) => event.type === MAELSTROM_EVENT_LAUNCHED);
  const poolId = typeof launched?.parsedJson["pool_id"] === "string" ? (launched.parsedJson["pool_id"] as string) : null;
  if (!poolId) {
    return fail("The launch finished without the pool's on-chain confirmation.", { coinType, digest: run.digest });
  }
  const locker = launched?.parsedJson["locker"] as { position?: { id?: string } } | undefined;

  return {
    status: "CONFIRMED",
    error: null,
    digest: run.digest,
    coinType,
    poolId,
    positionId: locker?.position?.id ?? null,
    launchId: typeof launched?.parsedJson["launch_id"] === "string" ? (launched.parsedJson["launch_id"] as string) : null,
  };
}

/** Kept for monitoring: the event type every genuine Maelstrom launch emits. */
export const MAELSTROM_LAUNCH_EVENT = `${MAELSTROM_ORIGINAL_PACKAGE_ID}::launchpad::Launched`;
export { packageIdOfCoinType };

function packageIdOfCoinType(coinType: string): string {
  return coinType.split("::")[0] ?? coinType;
}
