// SPDX-License-Identifier: BUSL-1.1
/**
 * Store-agnostic logic for the self-serve creator-fee claim flow.
 *
 * The server function in feePayout.functions.ts supplies a Supabase-backed
 * store; tests supply an in-memory one, so the exact same decision path is
 * exercised end to end.
 */

export type ClaimLink = {
  token: string;
  launch_symbol: string;
  x_username: string | null;
  status: string;
  amount_sui?: number;
  claimed_wallet?: string | null;
};

export type ClaimStore = {
  getLink(token: string): Promise<ClaimLink | null>;
  getXUsername(userId: string): Promise<string | null>;
  getWallet(userId: string): Promise<string | null>;
  /** Must only succeed while the link is still pending (atomic claim). */
  markClaimed(token: string, wallet: string): Promise<ClaimLink | null>;
  rememberPayout(input: {
    userId: string;
    symbol: string;
    wallet: string;
    xUsername: string;
  }): Promise<void>;
};

export type ClaimViewer = {
  xUsername: string | null;
  wallet: string | null;
  reservedFor: string | null;
  xMatches: boolean;
};

export type ClaimOutcome =
  | { ok: true; message: string; claim: ClaimLink }
  | { ok: false; message: string };

export function normalizeHandle(value?: string | null): string | null {
  const handle = (value ?? "").trim().replace(/^@/, "");
  return handle.length > 0 ? handle : null;
}

export function normalizeWallet(value?: string | null): string | null {
  const wallet = (value ?? "").trim().toLowerCase();
  return /^0x[a-f0-9]{40,64}$/.test(wallet) ? wallet : null;
}

export function sameHandle(a?: string | null, b?: string | null): boolean {
  const left = normalizeHandle(a);
  const right = normalizeHandle(b);
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

export function shortWallet(wallet: string): string {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

/** What the signed-in visitor of a claim page has in place. */
export async function readClaimViewer(
  store: ClaimStore,
  userId: string,
  token: string,
): Promise<ClaimViewer> {
  const [xUsername, walletRaw, link] = await Promise.all([
    store.getXUsername(userId),
    store.getWallet(userId),
    store.getLink(token),
  ]);
  const reservedFor = normalizeHandle(link?.x_username);
  const handle = normalizeHandle(xUsername);
  return {
    xUsername: handle,
    wallet: normalizeWallet(walletRaw),
    reservedFor,
    xMatches: sameHandle(handle, reservedFor),
  };
}

/** 1 = connect X, 2 = link wallet, 3 = ready to claim. */
export function claimStep(viewer: ClaimViewer): 1 | 2 | 3 {
  if (!viewer.xUsername || !viewer.xMatches) return 1;
  if (!viewer.wallet) return 2;
  return 3;
}

/** Runs the full verification + claim, refusing anything unverified. */
export async function performClaim(
  store: ClaimStore,
  userId: string,
  token: string,
): Promise<ClaimOutcome> {
  const link = await store.getLink(token);
  if (!link) return { ok: false, message: "This claim link does not exist." };
  if (link.status !== "pending") {
    return { ok: false, message: "This claim link was already used or has expired." };
  }

  const viewerX = normalizeHandle(await store.getXUsername(userId));
  const reservedFor = normalizeHandle(link.x_username);
  if (!viewerX) {
    return { ok: false, message: "Sign in with X first so we can verify the handle." };
  }
  if (!sameHandle(viewerX, reservedFor)) {
    return { ok: false, message: `These fees are reserved for @${reservedFor}, not @${viewerX}.` };
  }

  const wallet = normalizeWallet(await store.getWallet(userId));
  if (!wallet) {
    return { ok: false, message: "Connect a Sui wallet to your OURBLAST account first." };
  }

  const row = await store.markClaimed(token, wallet);
  if (!row) {
    return { ok: false, message: "This claim link was already used or has expired." };
  }

  // Remember the destination so this launcher's future launches pay them
  // straight on chain instead of parking the share again.
  await store.rememberPayout({
    userId,
    symbol: row.launch_symbol,
    wallet,
    xUsername: reservedFor ?? viewerX,
  });

  return {
    ok: true,
    message: `Verified. Your $${row.launch_symbol} creator share is routed to ${shortWallet(wallet)}.`,
    claim: row,
  };
}
