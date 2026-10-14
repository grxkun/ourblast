// SPDX-License-Identifier: BUSL-1.1
/**
 * Launch a Sui token paid with SOL, ETH or BNB. Pure rules only — the bridge and
 * the launch live in fundedLaunch.server.ts.
 */
export type FundAsset = "SOL" | "ETH" | "BNB";

export interface FundWith { asset: FundAsset; amount: number }

/** Smallest amount of each asset we bridge to fund a launch. */
export const FUND_MIN: Record<FundAsset, number> = { SOL: 0.02, ETH: 0.0015, BNB: 0.01 };

/** The review is valid for 10 minutes; the bridged SUI has 2 hours to arrive. */
export const FUNDED_REVIEW_TTL_MS = 10 * 60_000;
export const FUNDED_ARRIVAL_TIMEOUT_MS = 2 * 3_600_000;

const FUND = /\s*\b(?:pay(?:ing)?\s+with|paid\s+with|fund(?:ed)?\s+(?:with|by)|using|with)\s+([0-9]*\.?[0-9]+)\s*\$?(sol|eth|bnb)\b/i;

/** "launch $MOON on suipump with 0.1 sol" → { asset: "SOL", amount: 0.1 } and the text without that phrase. */
export function parseFundWith(text: string): { fund: FundWith; rest: string } | null {
  const m = text.match(FUND);
  if (!m?.[1] || !m[2]) return null;
  const amount = Number(m[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const rest = (text.slice(0, m.index) + text.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, " ").trim();
  return { fund: { asset: m[2].toUpperCase() as FundAsset, amount }, rest };
}

/** SUI expected after the bridge, with a 3% cushion for fees and slippage. */
export function estimateSuiOut(amount: number, assetUsd: number, suiUsd: number): number {
  if (!(assetUsd > 0) || !(suiUsd > 0)) return 0;
  return (amount * assetUsd * 0.97) / suiUsd;
}

export function isConfirmLaunch(text: string): boolean {
  return /^(?:confirm|yes)\s+launch$|^launch\s+confirm$/.test(clean(text));
}
export function isCancelLaunch(text: string): boolean {
  return /^(?:cancel|no)\s+launch$|^launch\s+cancel$/.test(clean(text));
}
function clean(text: string): string {
  return text.replace(/@[a-z0-9_]{1,15}/gi, " ").replace(/[\s.,!?]+/g, " ").trim().toLowerCase();
}
