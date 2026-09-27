import {
  MAELSTROM_COIN_DECIMALS,
  MAELSTROM_COIN_SUPPLY,
  boundaryTickFor,
  coinSortsAsA,
  feeRateOf,
  launchDeposit,
  maxTickFor,
  minimumSeed,
  previewLaunch,
  tickFromU32,
} from "./src/lib/terminal/maelstrom";

// STROM itself: coin sorts as A against SUI (its launch event says coin_is_a true).
console.log("STROM isA:", coinSortsAsA("0xac512319b5aeab0758ee8f6f30428467c3191c79abf04404bb7efe6e03520047::strom::STROM", "0x2::sui::SUI"));
console.log("maxTick 220:", maxTickFor(220), "expect 443520");
console.log("maxTick 200:", maxTickFor(200), "expect 443600");
console.log("tickFromU32 4294849816:", tickFromU32(4294849816));

const suiPrice = 1.5;
const coinIsA = coinSortsAsA("0xabc1230000000000000000000000000000000000000000000000000000000000::wow::WOW", "0x2::sui::SUI");
const tickSpacing = 220;
const boundaryTick = boundaryTickFor({
  coinIsA,
  coinDecimals: MAELSTROM_COIN_DECIMALS,
  quoteDecimals: 9,
  supply: 1_000_000_000,
  startFdvInQuote: 4000 / suiPrice,
  tickSpacing,
});
const base = {
  coinIsA,
  supply: MAELSTROM_COIN_SUPPLY,
  creatorBps: 0,
  tickSpacing,
  boundaryTick,
  feeRate: feeRateOf(tickSpacing),
  creatorFeeBps: 8000,
};
const min = minimumSeed(base);
const seed = launchDeposit(min);
const preview = previewLaunch({ ...base, seed });
console.log({ coinIsA, boundaryTick, minSeed: min.toString(), seed: seed.toString() });
console.log({
  tickLower: preview.tickLower,
  tickUpper: preview.tickUpper,
  boundaryTickU32: preview.boundaryTickU32,
  devBuyCoins: preview.devBuyCoins.toString(),
  quoteDeposited: preview.quoteDeposited.toString(),
  liquidity: preview.liquidity.toString(),
});
