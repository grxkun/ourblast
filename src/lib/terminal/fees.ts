import { BLAST_BURN_RESERVE_ADDRESS, BOT_WALLET_ADDRESS, FOUNDER_ADDRESS } from "@/lib/ourblast.config";

/**
 * Launch fee policy for every token launched through the OURBLAST terminal or an
 * @ourblastbot launch call on X.
 *
 * OURBLAST charges nothing to launch. The only revenue share is on the creator
 * fee the launchpad itself pays out on trading volume.
 */
export const LAUNCH_FEE_SUI = 0;

export const CREATOR_FEE_SPLIT = {
  /** @ourblastbot wallet — operations and gas. */
  bot: 0.1,
  /** Buy & burn reserve — swapped to BLAST and burned. */
  buyBurn: 0.1,
  /** Developer share. */
  developer: 0.1,
  /** Stays with whoever launched the token: fees, burns, buybacks, rewards. */
  launcher: 0.7,
} as const;

export const CREATOR_FEE_ROUTES = [
  { label: "@ourblastbot (ops & gas)", share: CREATOR_FEE_SPLIT.bot, address: BOT_WALLET_ADDRESS },
  { label: "BLAST buy & burn (from @ourblastbot)", share: CREATOR_FEE_SPLIT.buyBurn, address: BOT_WALLET_ADDRESS },
  { label: "Developer", share: CREATOR_FEE_SPLIT.developer, address: FOUNDER_ADDRESS },
  { label: "Launcher (you)", share: CREATOR_FEE_SPLIT.launcher, address: null },
] as const;

export const LAUNCHER_SHARE_USES = "fees, burn, buyback, holder rewards — your call";

/** One-line summary used in terminal replies and X replies. */
export const FEE_SUMMARY = "0 launch fee. Creator fees from the pad split 10% @ourblastbot / 10% BLAST buy & burn / 10% dev / 70% launcher.";

export function shareOf(amount: number, share: number): number {
  return Math.round(amount * share * 1_000_000) / 1_000_000;
}

/**
 * Gas policy. OURBLAST never charges a launch fee, and Sui network gas is
 * always sponsored from the @ourblastbot wallet — for terminal launches and
 * for launches called in from X alike.
 */
export type GasPayer = "launcher" | "bot-reserve";

export function gasPayerFor(_source: "terminal" | "x"): GasPayer {
  return "bot-reserve";
}

export function describeGasPolicy(_source: "terminal" | "x"): string {
  return "Gas is covered by the @ourblastbot wallet.";
}

export const GAS_NOTE_TERMINAL = describeGasPolicy("terminal");
export const GAS_NOTE_X = describeGasPolicy("x");
