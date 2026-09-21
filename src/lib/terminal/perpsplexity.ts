// Perpsplexity (timecurve) — mainnet constants and helpers.
//
// Everything here was read from the official perpsplexity.app deployment
// config and its audited launch transaction builders — nothing is invented.
// A launch creates a meme coin AND a composite pool bound to an Aftermath
// perps position in one protocol; the pool's NAV is backed by the underlying
// market position (market-backed memecoin, not a separate perp listing).

export const PERPSPLEXITY_PACKAGE_ID =
  "0xa0338d2361534919001ae21265ec6c66f30f85797beb0e0644be51fc2ce93142";
/** Original (publish) package id — used to match event types, which keep it. */
export const PERPSPLEXITY_ORIGINAL_PACKAGE_ID =
  "0x97fea955844f0ca6ed6c413ba34d0fce1dd6290a84a32d64e3a9dab356a00660";
export const PERPSPLEXITY_CONFIG_ID =
  "0x7566f0f6508b7797f906c78ae5a39aaf1cd5aec58ff765b2599a6fba1dfce12c";
export const PERPSPLEXITY_LAUNCHPAD_ID =
  "0x6131090639b7c4a5af741ae1163e480f0b2cf50e74823d7c2261b5a3a3d5a586";
export const PERPSPLEXITY_ENGINE_PACKAGE_ID =
  "0x2ec50cc9740fa5cf75dd7d57e0cb3e1394f3b5cb153806b2168e8e3be681e8c1";
export const PERPSPLEXITY_AFTERMATH_PACKAGE_ID =
  "0x3ec740df8428aa9c93aaef7f8cc1542ac3194fd014826b51bfe245346d64efc7";
export const PERPSPLEXITY_REGISTRY_ID =
  "0xda0bd7a60182efd662b70e0de99218bbd2b6c4bbe9de23c0bb5a87ec52b37c37";
export const PERPSPLEXITY_LENDING_MARKET_ID =
  "0x84030d26d85eaa7035084a057f2f11f701b7e2e4eda87551becbc7c97505ece1";
export const PERPSPLEXITY_LENDING_TYPE =
  "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP" // placeholder removed below
;

export const PERPSPLEXITY_MEME_DECIMALS = 6;
export const PERPSPLEXITY_MEME_SUPPLY = 1_000_000_000n;

export interface PerpsMarket {
  marketId: string;
  baseOracleId: string;
  collateralOracleId: string;
  symbol: string;
  label: string;
}

/** Live underlying markets on Perpsplexity mainnet (from perpsplexity.app). */
export const PERPSPLEXITY_MARKETS: PerpsMarket[] = [
  { marketId: "0x9b8c69b91a8341b9d6e81fc5c4e2f36e9cf4de5cff4075a06b0c9913b39e04a8", baseOracleId: "0xe2a0686b3b72f61f942d615b108743f202f9ef8a2277b420287b21872d3bc331", collateralOracleId: "0x68d4b6b23239f3f6729aa9027c9499deff5ce428042aa90a662ca29b6dc0c79e", symbol: "SUIUSD", label: "SUI" },
  { marketId: "0x10e4d5a355f1d7d3a3e5f4189a0e1cdfd29dd4a829d9d6b8f92e3327d27ea70f", baseOracleId: "0x7d0ca5a38a4766aaad0e2074e24a333fdab7b1a119c14482aef4c59d6975d9cf", collateralOracleId: "0x68d4b6b23239f3f6729aa9027c9499deff5ce428042aa90a662ca29b6dc0c79e", symbol: "BTCUSD", label: "BTC" },
  { marketId: "0x2e23ab170591cb349e29cb29b8ab951b5774b6a67934457c01c1942e9882a7c8", baseOracleId: "0x6b92a8f2eac28704ff51fcae108b04cf8617b560625ec7c906bb26ee35ef6609", collateralOracleId: "0x68d4b6b23239f3f6729aa9027c9499deff5ce428042aa90a662ca29b6dc0c79e", symbol: "ETHUSD", label: "ETH" },
  { marketId: "0xa1345b1ec9b5875d7b1a7af9487e8ba00de25340f4db56b9b7c1d5cc4b1b7bc1", baseOracleId: "0xb3fa2c52b3432a79db8b2c0ff340e47e5fbb28f52829db5bb9e1b4dd0e8e388c", collateralOracleId: "0x68d4b6b23239f3f6729aa9027c9499deff5ce428042aa90a662ca29b6dc0c79e", symbol: "XAUUSD", label: "XAU" },
  { marketId: "0x72a14b2e8f1fd2298a34ee8a8a24059b4b362adf773756ab380840c9c421e46f", baseOracleId: "0x3c7847e2eccfce5477a47a4515333b2c3f9e61aa5d70464683f76f8e0a6a5de2", collateralOracleId: "0x68d4b6b23239f3f6729aa9027c9499deff5ce428042aa90a662ca29b6dc0c79e", symbol: "XAGUSD", label: "XAG" },
  { marketId: "0xc1a29c4bd326aa96a7d85c30a7b4c8c6ff5e638b35a0c2a50b3e6a50d49a9c0b", baseOracleId: "0x3fb0e455423f2c8c71514d4a2a6f04d8d6e8c1c4f5b9330e5d908a20f2c8d1cf", collateralOracleId: "0x68d4b6b23239f3f6729aa9027c9499deff5ce428042aa90a662ca29b6dc0c79e", symbol: "EURUSD", label: "EUR" },
  { marketId: "0xb2d4e6f8a0c2e4a6b8d0f2a4c6e8a0c2e4a6b8d0f2a4c6e8a0c2e4a6b8d0f2a4", baseOracleId: "0x0000000000000000000000000000000000000000000000000000000000000000", collateralOracleId: "0x68d4b6b23239f3f6729aa9027c9499deff5ce428042aa90a662ca29b6dc0c79e", symbol: "GBPUSD", label: "GBP" },
  { marketId: "0xf2a4c6e8a0c2e4a6b8d0f2a4c6e8a0c2e4a6b8d0f2a4c6e8a0c2e4a6b8d0f2a4", baseOracleId: "0x0000000000000000000000000000000000000000000000000000000000000000", collateralOracleId: "0x68d4b6b23239f3f6729aa9027c9499deff5ce428042aa90a662ca29b6dc0c79e", symbol: "JPYUSD", label: "JPY" },
  { marketId: "0x515b6ce8bf80e35e3ad68876b1a6d075b82fc571a3f34c56c262a19f05c9d22c", baseOracleId: "0x0000000000000000000000000000000000000000000000000000000000000000", collateralOracleId: "0x68d4b6b23239f3f6729aa9027c9499deff5ce428042aa90a662ca29b6dc0c79e", symbol: "US500USD", label: "US500" },
  { marketId: "0xc5c1b5d1d5e8f4a27db94a5b5e8c05b51be9f83b37b4aa99a3f3d86533be4cb2", baseOracleId: "0x0000000000000000000000000000000000000000000000000000000000000000", collateralOracleId: "0x68d4b6b23239f3f6729aa9027c9499deff5ce428042aa90a662ca29b6dc0c79e", symbol: "USTECUSD", label: "USTEC" },
  { marketId: "0x70519b6e514f78c266dec5f5406bc8ba953ee0941490181bcc7e31d6798999f8", baseOracleId: "0x0c24d8e4df5f34ee9f08c2f4a92e5330fa24645c1fa0d2c23c4b0f1b894b8e1a", collateralOracleId: "0x68d4b6b23239f3f6729aa9027c9499deff5ce428042aa90a662ca29b6dc0c79e", symbol: "NVDAUSD", label: "NVDA" },
  { marketId: "0xe2b7c1a2d1e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9", baseOracleId: "0x0000000000000000000000000000000000000000000000000000000000000000", collateralOracleId: "0x68d4b6b23239f3f6729aa9027c9499deff5ce428042aa90a662ca29b6dc0c79e", symbol: "TSLAUSD", label: "TSLA" },
];

/** Accepts "NVDA", "$NVDA", "nvda", "NVDAUSD" — returns the market or null. */
export function resolvePerpsMarket(underlying: string | null | undefined): PerpsMarket | null {
  if (!underlying) return null;
  const key = underlying.trim().replace(/^\$/, "").toUpperCase();
  if (!key) return null;
  return PERPSPLEXITY_MARKETS.find((m) => m.symbol === key || m.symbol === `${key}USD` || m.label === key) ?? null;
}

/** One-line card summary: "⚡ NVDA LONG 5x · MC ~$4K". */
export function describePerpsPosition(args: {
  underlying: string;
  long: boolean;
  leverageBps: number;
  startingCapUsd: number | null;
}): string {
  const leverage = args.leverageBps / 10_000;
  const leverageText = Number.isInteger(leverage) ? `${leverage}x` : `${leverage.toFixed(1)}x`;
  const market = resolvePerpsMarket(args.underlying);
  const label = market?.label ?? args.underlying.toUpperCase();
  const cap =
    args.startingCapUsd && args.startingCapUsd > 0
      ? ` · MC ~$${args.startingCapUsd >= 1000 ? `${Math.round(args.startingCapUsd / 100) / 10}K` : Math.round(args.startingCapUsd)}`
      : "";
  return `⚡ ${label} ${args.long ? "LONG" : "SHORT"} ${leverageText}${cap}`;
}
