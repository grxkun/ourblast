// SPDX-License-Identifier: BUSL-1.1
/** Rules for moving OurBank EVM deposits into the user's Sui wallet. Pure — no I/O. */
export const NATIVE = "0x0000000000000000000000000000000000000000";

export type SweepChain = "base" | "arbitrum" | "robinhood";

export const SWEEP_CHAINS: Record<SweepChain, { id: number; rpc: string; explorer: string; usdc: string | null; route: "mayan" | "relay" }> = {
  base: { id: 8453, rpc: "https://mainnet.base.org", explorer: "https://basescan.org", usdc: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", route: "mayan" },
  arbitrum: { id: 42161, rpc: "https://arb1.arbitrum.io/rpc", explorer: "https://arbiscan.io", usdc: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", route: "mayan" },
  // Robinhood Chain can't reach Sui directly: Relay moves the ETH to the same
  // address on Arbitrum, where the next scan sends it on to Sui via Mayan.
  robinhood: { id: 4663, rpc: "https://rpc.mainnet.chain.robinhood.com", explorer: "https://robin.etherscan.io", usdc: null, route: "relay" },
};

export const ETH_MIN = 1_500_000_000_000_000n; // 0.0015 ETH (~$5) smallest deposit we move
export const ETH_GAS_KEEP = 300_000_000_000_000n; // 0.0003 ETH left behind for network fees
export const USDC_MIN = 2_000_000n; // 2 USDC
export const USDC_GAS_NEEDED = 30_000_000_000_000n; // 0.00003 ETH needed to approve + send USDC

/** ETH to move given the address balance; 0n = leave it. */
export function ethSweepAmount(balance: bigint): bigint {
  if (balance < ETH_MIN) return 0n;
  return balance - ETH_GAS_KEEP;
}

/** USDC to move: everything, if there's enough of it and ETH to pay fees. */
export function usdcSweepAmount(usdc: bigint, eth: bigint): { amount: bigint; reason: "ok" | "too_small" | "needs_gas" } {
  if (usdc < USDC_MIN) return { amount: 0n, reason: "too_small" };
  if (eth < USDC_GAS_NEEDED) return { amount: 0n, reason: "needs_gas" };
  return { amount: usdc, reason: "ok" };
}

/** EVM_SWEEP_ALLOW: unset = off, "*" = everyone, else comma-separated handles. */
export function sweepAllowed(setting: string | undefined, handle: string): boolean {
  const raw = setting?.trim();
  if (!raw) return false;
  if (raw === "*") return true;
  return raw.split(",").map((h) => h.trim().replace(/^@/, "").toLowerCase()).includes(handle.toLowerCase());
}
