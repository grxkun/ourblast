// SPDX-License-Identifier: BUSL-1.1
import type { LiveFeeRow } from "./liveFees.functions";

/** Picks the on-chain fee row for a token, by ticker or by curve/token address. */
export function findLiveFee(
  rows: LiveFeeRow[] | undefined,
  match: { symbol?: string | null; tokenAddress?: string | null },
): LiveFeeRow | null {
  if (!rows?.length) return null;
  const address = match.tokenAddress?.trim().toLowerCase() ?? "";
  if (address) {
    const byAddress = rows.find((row) => row.curveId.toLowerCase() === address);
    if (byAddress) return byAddress;
  }
  const symbol = (match.symbol ?? "").replace(/^\$/, "").trim().toUpperCase();
  if (!symbol) return null;
  return rows.find((row) => row.symbol === symbol) ?? null;
}

/** The slice of a curve's pending fees that belongs to one wallet, in SUI. */
export function walletShareSui(row: LiveFeeRow | null, wallet?: string | null): number {
  if (!row || !wallet) return 0;
  const target = wallet.trim().toLowerCase();
  const bps = row.payouts
    .filter((payout) => payout.recipient.toLowerCase() === target)
    .reduce((sum, payout) => sum + payout.bps, 0);
  return (row.pendingSui * bps) / 10_000;
}

/** Human amount for fee displays; distinguishes "nothing yet" from "not readable". */
export function liveFeeLabel(row: LiveFeeRow | null, fallback = "Reading from chain…"): string {
  if (!row) return fallback;
  return `${row.pendingSui.toLocaleString(undefined, { maximumFractionDigits: 4 })} SUI`;
}
