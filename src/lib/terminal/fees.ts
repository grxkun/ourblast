import { DEFAULT_TREASURY_ADDRESS, FOUNDER_ADDRESS } from "@/lib/ourblast.config";

/**
 * Launch fee policy for every token launched through the OURBLAST terminal or an
 * @ourblastbot launch call on X.
 *
 * OURBLAST charges nothing to launch. The only revenue share is on the creator
 * fee the launchpad itself pays out on trading volume.
 */
export const LAUNCH_FEE_SUI = 0;

export const CREATOR_FEE_SPLIT = {
  /** OURBLAST community treasury. */
  treasury: 0.2,
  /** Developer share. */
  developer: 0.1,
  /** Stays with whoever launched the token: fees, burns, buybacks, rewards. */
  launcher: 0.7,
} as const;

export const CREATOR_FEE_ROUTES = [
  { label: "OURBLAST treasury", share: CREATOR_FEE_SPLIT.treasury, address: DEFAULT_TREASURY_ADDRESS },
  { label: "Developer", share: CREATOR_FEE_SPLIT.developer, address: FOUNDER_ADDRESS },
  { label: "Launcher (you)", share: CREATOR_FEE_SPLIT.launcher, address: null },
] as const;

export const LAUNCHER_SHARE_USES = "fees, burn, buyback, holder rewards — your call";

/** One-line summary used in terminal replies and X replies. */
export const FEE_SUMMARY = "0 launch fee. Creator fees from the pad split 20% OURBLAST treasury / 10% dev / 70% launcher.";

export function shareOf(amount: number, share: number): number {
  return Math.round(amount * share * 1_000_000) / 1_000_000;
}
