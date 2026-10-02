// SPDX-License-Identifier: BUSL-1.1
import { createServerFn } from "@tanstack/react-start";

export interface LiveFeeRow {
  /** Upper-case ticker, the key everything else in the app already uses. */
  symbol: string;
  /** Shared curve object id — also the token address on Suipump. */
  curveId: string;
  /** Creator fees sitting in the curve right now, in SUI. */
  pendingSui: number;
  graduated: boolean;
  payouts: { recipient: string; bps: number }[];
}

/**
 * Live creator-fee balances read straight off chain, so claim pages and the
 * public dashboard can show real amounts instead of "Not indexed yet".
 * On-chain public data only — no wallet, session or private information.
 */
export const getLiveCreatorFees = createServerFn({ method: "GET" }).handler(async () => {
  const { listCreatorFeeVaults } = await import("./creatorClaim.server");
  const vaults = await listCreatorFeeVaults().catch(() => []);
  const rows: LiveFeeRow[] = vaults.map((vault) => ({
    symbol: vault.symbol.toUpperCase(),
    curveId: vault.curveId,
    pendingSui: vault.pendingSui,
    graduated: vault.graduated,
    payouts: vault.payouts,
  }));
  return {
    readAt: new Date().toISOString(),
    totalPendingSui: rows.reduce((sum, row) => sum + row.pendingSui, 0),
    rows,
  };
});
