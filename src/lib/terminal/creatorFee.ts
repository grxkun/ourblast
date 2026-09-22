/**
 * Creator-fee endorsement / designation layer.
 *
 * A deployer can name another wallet as the recipient of the launchpad's
 * creator fee for a token. OURBLAST only records and displays that
 * designation — it never custodies funds and never implies the recipient
 * endorsed, approved or launched the token.
 */
import { isSuiAddress, normalizeXUsername } from "./feePayout";
import { matchLaunchpad } from "./launchpad";

export const DESIGNATION_DISCLAIMER =
  "The deployer has designated this wallet to receive creator fees. This designation does not indicate endorsement or affiliation by the recipient.";

export const DESIGNATION_AUTHORIZATION =
  "I authorize OurBlast to designate this wallet as the creator-fee recipient.";

export const DESIGNATION_STATUSES = ["designated", "claimable", "claimed", "recalled"] as const;
export type DesignationStatus = (typeof DESIGNATION_STATUSES)[number];

export interface CreatorFeeDesignation {
  tokenAddress: string;
  chain: string;
  launchpad: string;
  tokenSymbol: string;
  tokenName: string | null;
  deployerWallet: string | null;
  recipientWallet: string;
  recipientName: string | null;
  recipientXHandle: string | null;
  designatedAt: string;
  designationTx: string | null;
  unclaimedAmount: number;
  claimedAmount: number;
  tradingVolume: number;
  claimTx: string | null;
  claimedWallet: string | null;
  status: DesignationStatus;
}

/**
 * Whether the pad's protocol lets the creator-fee recipient be changed after
 * deployment. On Suipump the recipients are written into the token at creation
 * and are permanent; Perpsplexity pays creators through its own pool. So the
 * recipient must be set at deployment time on every supported pad today.
 */
export function canChangeRecipientAfterDeploy(launchpad?: string | null): boolean {
  void matchLaunchpad(launchpad);
  return false;
}

export function recipientLockedNote(launchpad?: string | null): string {
  const pad = matchLaunchpad(launchpad);
  const label = pad?.label ?? "This launchpad";
  return `${label} writes the creator-fee recipients into the token at creation, so a designation cannot be changed afterwards. Designate the recipient before deploying.`;
}

/** Looks like a Sui object / coin-type address rather than an OURBLAST claim-link token. */
export function looksLikeTokenAddress(value: string): boolean {
  return /^0x[a-f0-9]{6,}/i.test(value.trim());
}

/**
 * A designation the recipient has not claimed yet can be taken back by the
 * deployer, who then claims the parked fees themselves through a fresh link.
 * Once claimed, it stands.
 */
export function canRecallDesignation(row: Pick<CreatorFeeDesignation, "status">): boolean {
  return row.status !== "claimed" && row.status !== "recalled";
}

export const RECALL_NOTE =
  "Recalling ends the endorsement: the designated wallet can no longer claim, its claim link stops working, and a new claim link is issued to you.";

export function statusLabel(row: Pick<CreatorFeeDesignation, "status" | "unclaimedAmount">): string {
  if (row.status === "recalled") return "Endorsement Recalled";
  if (row.status === "claimed") return "Claimed";
  if (row.status === "claimable" || row.unclaimedAmount > 0) return "Claimable";
  return "Fee Recipient Designated";
}

/** Shown on the dashboard, where "has the recipient acted yet" is the useful read. */
export function claimStateLabel(row: Pick<CreatorFeeDesignation, "status">): string {
  if (row.status === "recalled") return "Recalled by Deployer";
  return row.status === "claimed" ? "Claimed" : "Recipient Not Yet Claimed";
}

export function shortWallet(value?: string | null): string {
  if (!value) return "—";
  return value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

export function formatSui(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "0 SUI";
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} SUI`;
}

export interface DesignationInput {
  tokenAddress: string;
  tokenSymbol: string;
  tokenName?: string | null | undefined;
  launchpad?: string | null | undefined;
  recipientWallet: string;
  recipientName?: string | null | undefined;
  recipientXHandle?: string | null | undefined;
  authorized: boolean;
}

/** Server-authoritative validation. Throws with a plain-language reason. */
export function normalizeDesignation(input: DesignationInput): {
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string | null;
  launchpad: string;
  recipientWallet: string;
  recipientName: string | null;
  recipientXHandle: string | null;
} {
  if (!input.authorized) {
    throw new Error("You must confirm the authorization before a recipient can be designated.");
  }
  const tokenAddress = input.tokenAddress.trim().toLowerCase();
  if (!looksLikeTokenAddress(tokenAddress)) {
    throw new Error("That does not look like a Sui token address.");
  }
  const recipientWallet = input.recipientWallet.trim();
  if (!isSuiAddress(recipientWallet)) {
    throw new Error("The recipient wallet is not a valid Sui address.");
  }
  const symbol = input.tokenSymbol.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10);
  if (!symbol) throw new Error("A token ticker is required.");
  const handle = normalizeXUsername(input.recipientXHandle ?? "");
  const pad = matchLaunchpad(input.launchpad);
  return {
    tokenAddress,
    tokenSymbol: symbol,
    tokenName: input.tokenName?.trim().slice(0, 64) || null,
    launchpad: pad?.id ?? "suipump",
    recipientWallet: recipientWallet.toLowerCase(),
    recipientName: input.recipientName?.trim().slice(0, 64) || null,
    recipientXHandle: handle || null,
  };
}

/**
 * Optional shareable X post. Deliberately worded as a designation, never as an
 * endorsement, and never suggesting the recipient launched the token.
 */
export function shareText(row: {
  tokenSymbol: string;
  unclaimedAmount: number;
  recipientXHandle?: string | null;
  recipientWallet: string;
  claimUrl: string;
}): string {
  const who = row.recipientXHandle ? `@${row.recipientXHandle}` : shortWallet(row.recipientWallet);
  return [
    `$${row.tokenSymbol} currently has ${formatSui(row.unclaimedAmount)} in creator fees designated to ${who}.`,
    `The designated wallet can claim them here: ${row.claimUrl}`,
    "Designation by the deployer — not an endorsement or affiliation.",
  ].join("\n");
}
