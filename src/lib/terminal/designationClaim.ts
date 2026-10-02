// SPDX-License-Identifier: BUSL-1.1
/**
 * Store-agnostic logic for claiming a creator-fee designation.
 *
 * The server function in creatorFee.functions.ts supplies a Supabase-backed
 * store; tests supply an in-memory one, so the exact same decision path is
 * exercised. Only the designated recipient can ever claim: the wallet linked to
 * the signed-in account must match the designated recipient wallet, and the
 * claim update is atomic so two concurrent requests can never both win.
 */

export type DesignationRow = {
  token_address: string;
  recipient_wallet: string;
  recipient_x_handle?: string | null;
  status: string;
  unclaimed_amount?: number | null;
  designation_tx?: string | null;
  claimed_wallet?: string | null;
};

export type DesignationClaimStore = {
  getDesignation(tokenAddress: string): Promise<DesignationRow | null>;
  /** Wallet linked to the signed-in account, or null when none is connected. */
  getWallet(userId: string): Promise<string | null>;
  /** X handle linked to the signed-in account, when known. */
  getXUsername?(userId: string): Promise<string | null>;
  /** Must only succeed while the row is not yet claimed (atomic claim). */
  markClaimed(input: {
    tokenAddress: string;
    wallet: string;
    amount: number;
    claimTx: string | null;
  }): Promise<DesignationRow | null>;
};

export type DesignationClaimOutcome = { ok: boolean; message: string };

export const CLAIM_MESSAGES = {
  noWallet: "Connect the designated Sui wallet first.",
  missing: "No designation exists for that token.",
  claimed: "This designation was already claimed.",
  recalled: "The deployer recalled this endorsement, so it can no longer be claimed.",
  wrongWallet: "The connected wallet is not the designated recipient wallet for this token.",
  wrongHandle: "These creator fees are designated to another X account.",
  success:
    "Claimed. Creator fees for this token pay to your wallet on chain — OURBLAST never holds them.",
} as const;

export function normalizeAddress(value?: string | null): string | null {
  const address = (value ?? "").trim().toLowerCase();
  return address.length > 0 ? address : null;
}

function handle(value?: string | null): string | null {
  const clean = (value ?? "").trim().replace(/^@/, "").toLowerCase();
  return clean.length > 0 ? clean : null;
}

export async function performDesignationClaim(
  store: DesignationClaimStore,
  userId: string,
  tokenAddressInput: string,
): Promise<DesignationClaimOutcome> {
  const tokenAddress = (tokenAddressInput ?? "").trim().toLowerCase();

  const wallet = normalizeAddress(await store.getWallet(userId));
  if (!wallet) return { ok: false, message: CLAIM_MESSAGES.noWallet };

  const row = await store.getDesignation(tokenAddress);
  if (!row) return { ok: false, message: CLAIM_MESSAGES.missing };
  if (row.status === "claimed") return { ok: false, message: CLAIM_MESSAGES.claimed };
  if (row.status === "recalled") return { ok: false, message: CLAIM_MESSAGES.recalled };

  if (normalizeAddress(row.recipient_wallet) !== wallet) {
    return { ok: false, message: CLAIM_MESSAGES.wrongWallet };
  }

  // When the designation also names an X handle, the signed-in account must be
  // that handle — a matching wallet alone must not let a different account in.
  const designatedHandle = handle(row.recipient_x_handle);
  if (designatedHandle && store.getXUsername) {
    const viewerHandle = handle(await store.getXUsername(userId));
    if (viewerHandle && viewerHandle !== designatedHandle) {
      return { ok: false, message: CLAIM_MESSAGES.wrongHandle };
    }
  }

  const updated = await store.markClaimed({
    tokenAddress,
    wallet,
    amount: Number(row.unclaimed_amount ?? 0),
    claimTx: row.designation_tx ?? null,
  });
  if (!updated) return { ok: false, message: CLAIM_MESSAGES.claimed };

  return { ok: true, message: CLAIM_MESSAGES.success };
}
