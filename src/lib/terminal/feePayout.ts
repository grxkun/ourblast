// SPDX-License-Identifier: BUSL-1.1
/**
 * Where a creator's share of the launchpad creator fee goes.
 *
 * Default: the creator claims it themselves with the wallet that launched the
 * token. They can instead route it to another Sui wallet, or park it for an X
 * account — that account later claims it through an OURBLAST claim link.
 */
export const FEE_PAYOUT_MODES = ["creator", "wallet", "x"] as const;

export type FeePayoutMode = (typeof FEE_PAYOUT_MODES)[number];

export interface FeePayout {
  mode: FeePayoutMode;
  /** Destination Sui wallet when mode === "wallet". */
  wallet: string | null;
  /** Destination X handle (without @) when mode === "x". */
  xUsername: string | null;
}

export const DEFAULT_FEE_PAYOUT: FeePayout = { mode: "creator", wallet: null, xUsername: null };

export function isSuiAddress(value: string): boolean {
  return /^0x[a-f0-9]{40,64}$/i.test(value.trim());
}

export function normalizeXUsername(value: string): string {
  return value.trim().replace(/^@/, "").replace(/[^a-z0-9_]/gi, "").slice(0, 15);
}

/** Server-authoritative validation. An unusable destination falls back to the creator. */
export function normalizeFeePayout(input: Partial<FeePayout> | null | undefined): { payout: FeePayout; notes: string[] } {
  const notes: string[] = [];
  const mode: FeePayoutMode = FEE_PAYOUT_MODES.includes(input?.mode as FeePayoutMode)
    ? (input?.mode as FeePayoutMode)
    : "creator";

  if (mode === "wallet") {
    const wallet = (input?.wallet ?? "").trim();
    if (!isSuiAddress(wallet)) {
      notes.push("That payout wallet is not a valid Sui address, so creator fees stay claimable by you.");
      return { payout: { ...DEFAULT_FEE_PAYOUT }, notes };
    }
    return { payout: { mode: "wallet", wallet: wallet.toLowerCase(), xUsername: null }, notes };
  }

  if (mode === "x") {
    const xUsername = normalizeXUsername(input?.xUsername ?? "");
    if (!xUsername) {
      notes.push("That X handle is not usable, so creator fees stay claimable by you.");
      return { payout: { ...DEFAULT_FEE_PAYOUT }, notes };
    }
    return { payout: { mode: "x", wallet: null, xUsername }, notes };
  }

  return { payout: { ...DEFAULT_FEE_PAYOUT }, notes };
}

export function describeFeePayout(payout: FeePayout): string {
  if (payout.mode === "wallet") return `Creator fees are sent to ${payout.wallet}.`;
  if (payout.mode === "x") return `Creator fees are parked for @${payout.xUsername}, claimable with an OURBLAST claim link.`;
  return "Creator fees stay claimable by you, the launcher.";
}

export function shortFeePayout(payout: FeePayout): string {
  if (payout.mode === "wallet" && payout.wallet) return `${payout.wallet.slice(0, 6)}…${payout.wallet.slice(-4)}`;
  if (payout.mode === "x" && payout.xUsername) return `@${payout.xUsername}`;
  return "Creator (you)";
}
