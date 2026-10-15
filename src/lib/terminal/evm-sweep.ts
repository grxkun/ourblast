// SPDX-License-Identifier: BUSL-1.1
/** Rules for moving OurBank EVM deposits into the user's Sui wallet. Pure — no I/O. */
export const NATIVE = "0x0000000000000000000000000000000000000000";

export type SweepChain = "base" | "arbitrum" | "robinhood" | "bsc";
export type SweepToken = "ETH" | "USDC" | "BNB";

export const SWEEP_CHAINS: Record<SweepChain, { id: number; rpc: string; explorer: string; usdc: string | null; route: "mayan" | "relay" | "intents"; native: "ETH" | "BNB" }> = {
  base: { id: 8453, rpc: "https://mainnet.base.org", explorer: "https://basescan.org", usdc: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", route: "mayan", native: "ETH" },
  arbitrum: { id: 42161, rpc: "https://arb1.arbitrum.io/rpc", explorer: "https://arbiscan.io", usdc: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", route: "mayan", native: "ETH" },
  // Robinhood Chain can't reach Sui directly: Relay moves the ETH to the same
  // address on Arbitrum, where the next scan sends it on to Sui via Mayan.
  robinhood: { id: 4663, rpc: "https://rpc.mainnet.chain.robinhood.com", explorer: "https://robin.etherscan.io", usdc: null, route: "relay", native: "ETH" },
  // BNB Chain: native BNB goes to Sui through NEAR Intents 1Click (a plain transfer to a quoted deposit address).
  bsc: { id: 56, rpc: "https://bsc-dataseed.bnbchain.org", explorer: "https://bscscan.com", usdc: null, route: "intents", native: "BNB" },
};

export const ETH_MIN = 1_500_000_000_000_000n; // 0.0015 ETH (~$5) smallest deposit we move
export const ETH_GAS_KEEP = 300_000_000_000_000n; // 0.0003 ETH left behind for network fees
export const BNB_MIN = 10_000_000_000_000_000n; // 0.01 BNB smallest deposit we move
export const BNB_GAS_KEEP = 500_000_000_000_000n; // 0.0005 BNB left behind for network fees
export const USDC_MIN = 2_000_000n; // 2 USDC
export const USDC_GAS_NEEDED = 30_000_000_000_000n; // 0.00003 ETH needed to approve + send USDC

/** Native coin (ETH or BNB) to move given the address balance; 0n = leave it. */
export function ethSweepAmount(balance: bigint, native: "ETH" | "BNB" = "ETH"): bigint {
  const [min, keep] = native === "BNB" ? [BNB_MIN, BNB_GAS_KEEP] : [ETH_MIN, ETH_GAS_KEEP];
  if (balance < min) return 0n;
  return balance - keep;
}

/** USDC to move: everything, if there's enough of it and ETH to pay fees. */
export function usdcSweepAmount(usdc: bigint, eth: bigint): { amount: bigint; reason: "ok" | "too_small" | "needs_gas" } {
  if (usdc < USDC_MIN) return { amount: 0n, reason: "too_small" };
  if (eth < USDC_GAS_NEEDED) return { amount: 0n, reason: "needs_gas" };
  return { amount: usdc, reason: "ok" };
}

/** EVM_SWEEP_ALLOW: unset = off, "*" = everyone, else comma-separated handles. */
/** BNB → SOL → SUI fallback: SOL to send on from Solana once Relay delivers. 0n = not there yet. */
export const SOL_HOP_MIN = 20_000_000n; // 0.02 SOL — the Solana bridge minimum
export const SOL_HOP_KEEP = 3_000_000n; // 0.003 SOL stays for fees + rent
export function solHopAmount(expected: bigint, balance: bigint): bigint {
  if (balance < (expected * 97n) / 100n) return 0n; // Relay hasn't filled yet
  const room = balance - SOL_HOP_KEEP;
  const amt = expected < room ? expected : room;
  return amt >= SOL_HOP_MIN ? amt : 0n;
}

/** Hop bookkeeping kept on the sweep row: "sol:<lamports>:<keep|default>". */
export function encodeSolHop(lamports: bigint, keep: boolean): string {
  return `sol:${lamports}:${keep ? "keep" : "default"}`;
}
export function decodeSolHop(s: string | null): { lamports: bigint; keep: boolean } | null {
  const m = s?.match(/^sol:(\d+):(keep|default)$/);
  return m ? { lamports: BigInt(m[1]!), keep: m[2] === "keep" } : null;
}

export function sweepAllowed(setting: string | undefined, handle: string): boolean {
  const raw = setting?.trim();
  if (!raw) return false;
  if (raw === "*") return true;
  return raw.split(",").map((h) => h.trim().replace(/^@/, "").toLowerCase()).includes(handle.toLowerCase());
}
