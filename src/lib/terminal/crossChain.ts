// SPDX-License-Identifier: BUSL-1.1
/** Rules for auto-swapping bridged SUI into the chosen Sui token. */
export const CROSS_CHAIN_GAS_KEEP = 50_000_000n; // 0.05 SUI stays for network fees
export const CROSS_CHAIN_MIN_DEPOSIT = 100_000_000n; // 0.1 SUI minimum bridged amount

/** SUI to swap given the balance before and now; 0n means "not arrived yet". */
export function crossChainSwapAmount(baseline: bigint, current: bigint): bigint {
  const delta = current - baseline;
  if (delta < CROSS_CHAIN_MIN_DEPOSIT) return 0n;
  return delta - CROSS_CHAIN_GAS_KEEP;
}

/** Chains users can pay from inside the Mayan swap (Mayan API names). */
export const MAYAN_SOURCE_CHAINS = ["solana", "ethereum", "base", "arbitrum", "bsc", "optimism", "polygon", "avalanche", "hyperevm", "monad"] as const;

/** Chains Mayan can't reach yet: each gets an outside route into Sui. */
export const ALTERNATE_ROUTES = {
  near: { via: "NEAR Intents", url: "https://app.near-intents.org", landsOnSui: true },
  robinhood: { via: "Relay", url: "https://relay.link/bridge", landsOnSui: false, hopTo: ["arbitrum", "base"] },
} as const;
