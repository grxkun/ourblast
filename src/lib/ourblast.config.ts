/**
 * Single source of truth for the OURBLAST treasury and activity pricing.
 *
 * The treasury address is configurable: the browser reads
 * VITE_OURBLAST_TREASURY_ADDRESS, the server reads
 * OURBLAST_TREASURY_ADDRESS (inside handlers only). Both fall back to the
 * community treasury below so a missing env var can never silently point
 * payments at an empty string.
 */

export const DEFAULT_TREASURY_ADDRESS =
  "0xd9ba2ba33cc6eb61302cec564126caae22fbbe10f564789c5e6e5eca0940372c";

/** Founder share address — receives 10% of every game fee, on-chain. */
export const FOUNDER_ADDRESS =
  "0xa0ec4ee84d06471499e3d512d9d8af9bab40e6aeb6dfa197f16366e70e2660c4";

export const MIST_PER_SUI = 1_000_000_000;

/** Fees charged for community activities, in SUI. */
export const FEES = {
  game: 1,
  chat: 0.1,
} as const;

export type PaymentPurpose = keyof typeof FEES;

/**
 * Treasury plan. Every paid action lands in one community wallet; this split
 * is the published promise for how it gets spent, and the target is the
 * milestone the arcade is working towards. Numbers only — the wallet itself is
 * spent by the community, so keep this and the on-chain reality in sync.
 */
export const ECONOMY = {
  /** Prize pool paid back to the winning players. */
  prizePoolShare: 0.7,
  /** Community treasury: events, buybacks, hosting, art, tools. */
  opsShare: 0.2,
  /** Founder share, sent on-chain with every game payment. */
  founderShare: 0.1,
  /** Season length in days. */
  seasonDays: 30,
  /** Treasury milestone for the current season, in SUI. */
  seasonTargetSui: 1_000,
} as const;

/** Paid actions needed to hit the season target at current pricing. */
export function playsToTarget(): number {
  return Math.ceil(ECONOMY.seasonTargetSui / FEES.game);
}

export function feeInMist(purpose: PaymentPurpose): number {
  return Math.round(FEES[purpose] * MIST_PER_SUI);
}

/** Browser-side treasury address. */
export function treasuryAddress(): string {
  const configured = import.meta.env['VITE_OURBLAST_TREASURY_ADDRESS'] as string | undefined;
  return (configured && configured.startsWith("0x") ? configured : DEFAULT_TREASURY_ADDRESS).toLowerCase();
}

export const SUI_FULLNODES: Record<string, string> = {
  "sui:mainnet": "https://fullnode.mainnet.sui.io:443",
  "sui:testnet": "https://fullnode.testnet.sui.io:443",
  "sui:devnet": "https://fullnode.devnet.sui.io:443",
};

export const DEFAULT_SUI_CHAIN = "sui:mainnet";
