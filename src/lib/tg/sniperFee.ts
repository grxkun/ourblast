// SPDX-License-Identifier: BUSL-1.1
import { DEFAULT_TREASURY_ADDRESS, FOUNDER_ADDRESS } from "@/lib/ourblast.config";

/** Sniper fee on snipe volume: 1.5% total = 1% dev wallet + 0.5% community treasury. */
export const SNIPER_FEE_BPS = { dev: 100, treasury: 50 } as const;
export const SNIPER_FEE_RECIPIENTS = { dev: FOUNDER_ADDRESS, treasury: DEFAULT_TREASURY_ADDRESS } as const;
export const SNIPER_FEE_NOTE = "Sniper fee 1.5% (1% dev · 0.5% treasury), charged only after a confirmed buy.";

/** Splits a snipe budget (MIST) into dev fee, treasury fee and the net amount actually swapped. */
export function splitSniperFee(totalMist: bigint): { dev: bigint; treasury: bigint; net: bigint } {
  const dev = (totalMist * BigInt(SNIPER_FEE_BPS.dev)) / 10_000n;
  const treasury = (totalMist * BigInt(SNIPER_FEE_BPS.treasury)) / 10_000n;
  return { dev, treasury, net: totalMist - dev - treasury };
}
