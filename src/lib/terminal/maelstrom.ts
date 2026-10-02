// SPDX-License-Identifier: BUSL-1.1
/**
 * Maelstrom (maelstromfun.xyz) — mainnet constants plus the launch preview math.
 *
 * Every address here was read from live Sui mainnet state, and the pool math is
 * ported 1:1 from Maelstrom's own launch client (previewLaunch / boundaryTick /
 * minimumSeed), so a launch OurBlast builds prices exactly like a launch made on
 * the site. Nothing is invented: the launchpad is both factory and router, the
 * pool is a Cetus CLMM pool, and the LP position is locked forever by the locker
 * package (which exposes no unlock, burn or withdraw entry).
 */

/** Current launchpad package (V2 upgrade of the original publish below). */
export const MAELSTROM_PACKAGE_ID = "0xed1d6717ba00f452822039f295989bbaef6c10ce34a29ac8f28ea6de2867d6c6";
/** Original publish — event types keep it, so match events on this one. */
export const MAELSTROM_ORIGINAL_PACKAGE_ID = "0xc935f0ab11a24b32b6f8796bc78d93ce6f2d2969f5d4b4f6657b24352b61408a";
/** Shared Launchpad object: fees, creator split, allowed tick spacings. */
export const MAELSTROM_LAUNCHPAD_ID = "0x61a4aacb5b0beea23a6e3fb789b48a6f1b6f95b1c8a98b8d1bd5112b4666c5c4";
/** Locker package that holds every launch's LP position permanently. */
export const MAELSTROM_LOCKER_PACKAGE_ID = "0xc3f6f683a5da0d555a303f9fa5a43e86a6dcfcd399760426428963bdacc242fc";

/** Cetus CLMM objects the launchpad calls into. */
export const CETUS_GLOBAL_CONFIG_ID = "0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f";
export const CETUS_POOLS_ID = "0xf699e7f2276f5c9a75944b37a0c5b5d9ddfd2471bf6242483b03ab2887d198d0";

export const MAELSTROM_EVENT_LAUNCHED = `${MAELSTROM_ORIGINAL_PACKAGE_ID}::launchpad::Launched`;
export const MAELSTROM_EVENT_LOCKED = `${MAELSTROM_LOCKER_PACKAGE_ID}::locker::Locked`;

/** The coin package Maelstrom published for its own STROM launch (immutable). */
export const MAELSTROM_TEMPLATE_PACKAGE = "0xac512319b5aeab0758ee8f6f30428467c3191c79abf04404bb7efe6e03520047";
export const MAELSTROM_TEMPLATE_NAMES = { module: "strom", struct: "STROM" };

/** Template mints its whole supply up front: 1B coins at 9 decimals. */
export const MAELSTROM_COIN_DECIMALS = 9;
export const MAELSTROM_COIN_SUPPLY = 1_000_000_000_000_000_000n;
/** Opening valuation the launch form uses for every launch. */
export const MAELSTROM_START_FDV_USD = 4_000;
export const SUI_TYPE = "0x2::sui::SUI";
export const SUI_DECIMALS = 9;

/**
 * Quote assets a Maelstrom pool may pair with (launchpad has open_quotes = true).
 * Types and decimals verified with suix_getCoinMetadata on mainnet.
 */
export const MAELSTROM_QUOTES: Record<string, { type: string; decimals: number }> = {
  SUI: { type: SUI_TYPE, decimals: 9 },
  USDC: { type: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC", decimals: 6 },
  BLAST: { type: "0x577a8addf60a34d4c705914ad066a3b28c3fc40d365ed0d9dfc408f29b4725d3::blast::BLAST", decimals: 9 },
  DEEP: { type: "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP", decimals: 6 },
  WAL: { type: "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL", decimals: 9 },
};

/**
 * Public token page on Maelstrom. Their own client builds it as
 * `/coin/${encodeURIComponent(coinType)}` (read from the production bundle).
 */
export function maelstromCoinUrl(coinType: string): string {
  return `https://maelstromfun.xyz/coin/${encodeURIComponent(coinType)}`;
}

/** Chart for a launched pool. Maelstrom pools are plain Cetus pools, which Dexscreener indexes by pool id. */
export function dexscreenerPoolUrl(poolId: string): string {
  return `https://dexscreener.com/sui/${poolId}`;
}

/** Where collected LP fees go. The creator's own wallet is route 0. */
export const MAELSTROM_FEE_ROUTES = { wallet: 0, buybackBurn: 1, holderRewards: 2 } as const;
export type MaelstromFeeRoute = keyof typeof MAELSTROM_FEE_ROUTES;

/** The only two pool shapes the launchpad accepts (tick spacing → Cetus fee rate). */
export const MAELSTROM_FEE_TIERS = [
  { tickSpacing: 200, feeRate: 10_000 },
  { tickSpacing: 220, feeRate: 20_000 },
] as const;

const MAX_U64 = (1n << 64n) - 1n;
const MASK_U128 = (1n << 128n) - 1n;
const MAX_SQRT_PRICE = 0xfffec4b135bb7f32a81b33afn;
const MIN_SQRT_PRICE = 4295048016n;
const TICK_BASE_LOG = Math.log1p(1e-4);

const NEGATIVE_FACTORS: [number, bigint][] = [
  [2, 0xfff97272373d4132n], [4, 0xfff2e50f5f656932n], [8, 0xffe5caca7e10e4e6n], [16, 0xffcb9843d60f6159n],
  [32, 0xff973b41fa98c081n], [64, 0xff2ea16466c96a38n], [128, 0xfe5dee046a99a2a8n], [256, 0xfcbe86c7900a88aen],
  [512, 0xf987a7253ac41317n], [1024, 0xf3392b0822b70005n], [2048, 0xe7159475a2c29b74n], [4096, 0xd097f3bdfd2022b8n],
  [8192, 0xa9f746462d870fdfn], [16384, 0x70d869a156d2a1b8n], [32768, 0x31be135f97d08fd9n], [65536, 0x9aa508b5b7a84e1n],
  [131072, 0x5d6af8dedb8119n], [262144, 37481735321082n],
];
const POSITIVE_FACTORS: [number, bigint][] = [
  [2, 0x100068db8bac710cb295e9e1bn], [4, 0x1000d1b9c68abe5f76b30fb75n], [8, 0x1001a37e4a234cb0830516e51n],
  [16, 0x100347278ab0e92ada25ab460n], [32, 0x10068efb00a525480a5d7fdc2n], [64, 0x100d20a63b4173839df9daaa5n],
  [128, 0x101a4c11c742dd7729738df5en], [256, 0x1034c35c31f64cfa6dc0d6de4n], [512, 0x106a34b78c8aaffbf81bed5a3n],
  [1024, 0x10d72a6a46ccd8bce9ae771b1n], [2048, 0x11b9a258e63928596dc757faan], [4096, 0x13a2e2bda04f8379f3cd17be5n],
  [8192, 0x181954be69e0da8fe77f2ab42n], [16384, 0x244c2655d185a029080252877n], [32768, 0x525816eeb9f935b1c616779e8n],
  [65536, 0x1a7c8d00b551684ff4d31ae065n], [131072, 0x2bd893d0b2df7c97884590c66cdn],
  [262144, 0x78278e1e19e448cf8b95d2152dccfn],
];

export class MaelstromPreviewError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Cetus sqrt price (Q64.64) for a tick. */
export function tickToSqrtPrice(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < -443636 || tick > 443636) throw new Error(`tick out of range: ${tick}`);
  const magnitude = Math.abs(tick);
  if (tick < 0) {
    let ratio = magnitude & 1 ? 0xfffcb933bd6fad37n : 0x10000000000000000n;
    for (const [bit, factor] of NEGATIVE_FACTORS) if (magnitude & bit) ratio = ((ratio * factor) >> 64n) & MASK_U128;
    return ratio;
  }
  let ratio = magnitude & 1 ? 0x1000346d6ff11672ae55ad00fn : 0x1000000000000000000000000n;
  for (const [bit, factor] of POSITIVE_FACTORS) if (magnitude & bit) ratio = ((ratio * factor) >> 96n) & MASK_U128;
  return ratio >> 32n;
}

function div(a: bigint, b: bigint, roundUp: boolean): bigint {
  const quotient = a / b;
  return roundUp && quotient * b !== a ? quotient + 1n : quotient;
}

function asU64(value: bigint): bigint {
  if (value > MAX_U64) throw new Error("amount overflows u64");
  return value;
}

/** Liquidity for a coin-side deposit between two sqrt prices. */
function liquidityFromCoin(sqrtA: bigint, sqrtB: bigint, amount: bigint, roundUp: boolean): bigint {
  if (sqrtA === sqrtB) throw new Error("equal sqrt prices");
  const liquidity = div(sqrtA * sqrtB * amount, (sqrtA > sqrtB ? sqrtA - sqrtB : sqrtB - sqrtA) << 64n, roundUp);
  if (liquidity > MASK_U128) throw new Error("liquidity overflows u128");
  return liquidity;
}

/** Liquidity for a quote-side deposit between two sqrt prices. */
function liquidityFromQuote(sqrtA: bigint, sqrtB: bigint, amount: bigint, roundUp: boolean): bigint {
  if (sqrtA === sqrtB) throw new Error("equal sqrt prices");
  const liquidity = div(amount << 64n, sqrtA > sqrtB ? sqrtA - sqrtB : sqrtB - sqrtA, roundUp);
  if (liquidity > MASK_U128) throw new Error("liquidity overflows u128");
  return liquidity;
}

function coinAmount(sqrtA: bigint, sqrtB: bigint, liquidity: bigint, roundUp: boolean): bigint {
  const delta = sqrtA > sqrtB ? sqrtA - sqrtB : sqrtB - sqrtA;
  if (delta === 0n || liquidity === 0n) return 0n;
  const numerator = liquidity * delta;
  if (numerator >= 1n << 192n) throw new Error("multiplication overflow");
  return asU64(div(numerator << 64n, sqrtA * sqrtB, roundUp));
}

function quoteAmount(sqrtA: bigint, sqrtB: bigint, liquidity: bigint, roundUp: boolean): bigint {
  const delta = sqrtA > sqrtB ? sqrtA - sqrtB : sqrtB - sqrtA;
  if (delta === 0n || liquidity === 0n) return 0n;
  const product = liquidity * delta;
  return asU64(roundUp && (product & MAX_U64) > 0n ? (product >> 64n) + 1n : product >> 64n);
}

/** Highest tick usable at a given spacing. */
export function maxTickFor(tickSpacing: number): number {
  return 443636 - (443636 % tickSpacing);
}

export function tickToU32(tick: number): number {
  return tick < 0 ? (tick + 0x100000000) >>> 0 : tick;
}

export function tickFromU32(bits: number): number {
  return bits >= 0x80000000 ? bits - 0x100000000 : bits;
}

function priceToTick(price: number): number {
  if (!(price > 0) || !Number.isFinite(price)) throw new Error(`price must be finite and positive: ${price}`);
  const raw = Math.log(price) / TICK_BASE_LOG;
  const rounded = Math.round(raw);
  return Math.abs(raw - rounded) < 1e-6 ? rounded : Math.floor(raw);
}

function alignTick(tick: number, spacing: number, direction: "up" | "down"): number {
  return direction === "up" ? Math.ceil(tick / spacing) * spacing : Math.floor(tick / spacing) * spacing;
}

/**
 * Which side of the Cetus pool the coin sorts to — decided purely by the coin
 * type bytes, exactly as Maelstrom's client computes it.
 */
export function coinSortsAsA(coinType: string, quoteType: string): boolean {
  const strip = (type: string) => new TextEncoder().encode(type.replace(/^0x/, ""));
  const coin = strip(coinType);
  const quote = strip(quoteType);
  for (let i = 0; i < quote.length && i < coin.length; i += 1) {
    if ((coin[i] as number) < (quote[i] as number)) return false;
    if ((coin[i] as number) > (quote[i] as number)) return true;
  }
  if (coin.length === quote.length) throw new Error("same coin type");
  return coin.length > quote.length;
}

export function feeRateOf(tickSpacing: number): number {
  const tier = MAELSTROM_FEE_TIERS.find((entry) => entry.tickSpacing === tickSpacing);
  if (!tier) throw new Error(`no fee tier at tick spacing ${tickSpacing}`);
  return tier.feeRate;
}

/** Opening tick for a target fully-diluted valuation, in quote units. */
export function boundaryTickFor(args: {
  coinIsA: boolean;
  coinDecimals: number;
  quoteDecimals: number;
  /** Whole coins in circulation (supply / 10^decimals). */
  supply: number;
  startFdvInQuote: number;
  tickSpacing: number;
}): number {
  if (args.supply <= 0) throw new Error("supply must be positive");
  if (!(args.startFdvInQuote > 0)) throw new Error("opening valuation must be positive");
  const price = (args.startFdvInQuote / args.supply) * 10 ** (args.quoteDecimals - args.coinDecimals);
  const limit = maxTickFor(args.tickSpacing);
  const tick = args.coinIsA
    ? alignTick(priceToTick(price), args.tickSpacing, "down")
    : alignTick(priceToTick(1 / price), args.tickSpacing, "up");
  if (tick <= -limit || tick >= limit) throw new Error("opening valuation is outside what a pool can price");
  return tick;
}

export interface MaelstromPreviewInput {
  coinIsA: boolean;
  supply: bigint;
  /** Premine to the creator, in bps of supply. OurBlast always launches at 0. */
  creatorBps: number;
  tickSpacing: number;
  boundaryTick: number;
  feeRate: number;
  /** Launchpad's creator share of collected fees (8000 = 80% today). */
  creatorFeeBps: number;
  seed: bigint;
}

export interface MaelstromPreview {
  coinIsA: boolean;
  tickLower: number;
  tickUpper: number;
  boundaryTickU32: number;
  premine: bigint;
  float: bigint;
  protocolFee: bigint;
  spend: bigint;
  liquidity: bigint;
  sqrtOpen: bigint;
  devBuyCoins: bigint;
  quoteDeposited: bigint;
  quoteRefunded: bigint;
}

/** Port of Maelstrom's previewLaunch: what the on-chain call will do with a seed. */
export function previewLaunch(input: MaelstromPreviewInput): MaelstromPreview {
  if (input.creatorBps < 0 || input.creatorBps > 2000) throw new MaelstromPreviewError("bad-input", "premine above 20%");
  if (input.supply <= 0n) throw new MaelstromPreviewError("bad-input", "supply must be positive");
  if (input.boundaryTick % input.tickSpacing !== 0) throw new MaelstromPreviewError("bad-input", "tick not aligned");
  const limit = maxTickFor(input.tickSpacing);
  if (input.boundaryTick <= -limit || input.boundaryTick >= limit) {
    throw new MaelstromPreviewError("bad-input", "tick leaves no room for the range");
  }
  const premine = (input.supply * BigInt(input.creatorBps)) / 10_000n;
  const float = input.supply - premine;
  const gross = (input.seed * BigInt(input.feeRate)) / 1_000_000n;
  const protocolFee = gross - (gross * BigInt(input.creatorFeeBps)) / 10_000n;
  const net = input.seed - protocolFee;
  const reserve = net / 1000n + 10n;
  if (net <= reserve) throw new MaelstromPreviewError("seed-too-small", "the seed is too small to open the pool");
  const spend = net - reserve;

  if (input.coinIsA) {
    const tickLower = input.boundaryTick;
    const sqrtLower = tickToSqrtPrice(tickLower);
    const sqrtUpper = tickToSqrtPrice(limit);
    const liquidity = liquidityFromCoin(sqrtLower, sqrtUpper, float, false);
    const step = div(spend << 64n, liquidity, false);
    const sqrtOpen = sqrtLower + step;
    if (sqrtOpen > MAX_SQRT_PRICE) throw new Error("price above maximum");
    if (sqrtOpen < MIN_SQRT_PRICE) throw new Error("price below minimum");
    if (sqrtOpen <= sqrtLower) throw new MaelstromPreviewError("seed-too-small", "the seed does not move the price");
    if (sqrtOpen >= sqrtUpper) throw new MaelstromPreviewError("seed-too-large", "the seed buys the whole float");
    const devBuyCoins = coinAmount(sqrtLower, sqrtOpen, liquidity, false);
    const poolLiquidity = liquidityFromCoin(sqrtOpen, sqrtUpper, float - devBuyCoins, false);
    const quoteDeposited = quoteAmount(sqrtOpen, sqrtLower, poolLiquidity, true);
    if (quoteDeposited > net) throw new MaelstromPreviewError("seed-too-small", "rounding would exceed the seed");
    return {
      coinIsA: true,
      tickLower,
      tickUpper: limit,
      boundaryTickU32: tickToU32(tickLower),
      premine,
      float,
      protocolFee,
      spend,
      liquidity,
      sqrtOpen,
      devBuyCoins,
      quoteDeposited,
      quoteRefunded: net - quoteDeposited,
    };
  }

  const tickLower = -limit;
  const tickUpper = input.boundaryTick;
  const sqrtLower = tickToSqrtPrice(tickLower);
  const sqrtUpper = tickToSqrtPrice(tickUpper);
  const liquidity = liquidityFromQuote(sqrtLower, sqrtUpper, float, false);
  const product = sqrtUpper * liquidity;
  if (product >= 1n << 192n) throw new Error("multiplication overflow");
  const sqrtOpen = div(product << 64n, (liquidity << 64n) + sqrtUpper * spend, true);
  if (sqrtOpen < MIN_SQRT_PRICE) throw new Error("price below minimum");
  if (sqrtOpen > MAX_SQRT_PRICE) throw new Error("price above maximum");
  if (sqrtOpen >= sqrtUpper) throw new MaelstromPreviewError("seed-too-small", "the seed does not move the price");
  if (sqrtOpen <= sqrtLower) throw new MaelstromPreviewError("seed-too-large", "the seed buys the whole float");
  const devBuyCoins = quoteAmount(sqrtOpen, sqrtUpper, liquidity, false);
  const poolLiquidity = liquidityFromQuote(sqrtLower, sqrtOpen, float - devBuyCoins, false);
  const quoteDeposited = coinAmount(sqrtOpen, sqrtUpper, poolLiquidity, true);
  if (quoteDeposited > net) throw new MaelstromPreviewError("seed-too-small", "rounding would exceed the seed");
  return {
    coinIsA: false,
    tickLower,
    tickUpper,
    boundaryTickU32: tickToU32(tickUpper),
    premine,
    float,
    protocolFee,
    spend,
    liquidity,
    sqrtOpen,
    devBuyCoins,
    quoteDeposited,
    quoteRefunded: net - quoteDeposited,
  };
}

/** Smallest seed that still opens the pool — binary search, same as the site. */
export function minimumSeed(base: Omit<MaelstromPreviewInput, "seed">): bigint {
  const opens = (seed: bigint) => {
    try {
      previewLaunch({ ...base, seed });
      return true;
    } catch (error) {
      if (error instanceof MaelstromPreviewError && error.code === "seed-too-small") return false;
      throw error;
    }
  };
  let high = 16n;
  while (!opens(high)) {
    high *= 2n;
    if (high > 1n << 62n) throw new MaelstromPreviewError("bad-input", "no seed opens this pool");
  }
  let low = high / 2n;
  while (high - low > 1n) {
    const mid = (low + high) / 2n;
    if (opens(mid)) high = mid;
    else low = mid;
  }
  return high;
}

/** Seed the launch form deposits: comfortably above the minimum. */
export function launchDeposit(minSeed: bigint): bigint {
  return 4n * minSeed > minSeed + 1000n ? 4n * minSeed : minSeed + 1000n;
}

const isHttps = (value: string) => {
  try {
    return new URL(value.trim()).protocol === "https:";
  } catch {
    return false;
  }
};

/** Launch metadata string: a small JSON object of https links, max 1KB. */
export function buildLaunchMetadata(links: { website?: string | null; twitter?: string | null; telegram?: string | null }): string {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(links)) {
    const trimmed = value?.trim();
    if (trimmed && isHttps(trimmed)) out[key] = trimmed.slice(0, 120);
  }
  const json = Object.keys(out).length ? JSON.stringify(out) : "";
  return new TextEncoder().encode(json).length <= 1024 ? json : "";
}
