// SPDX-License-Identifier: BUSL-1.1
/** Pure bonding-curve math for scan cards (no network). */

/** Blast.fun v2 spot price in SUI: (virtual + real quote) / meme left on the curve. */
export function blastSpotSui(l: { virtualQuote: bigint; realQuote: bigint; memeReserve: bigint }, memeDecimals: number): number | null {
  if (l.memeReserve <= 0n) return null;
  const quote = Number(l.virtualQuote + l.realQuote) / 1e9;
  const meme = Number(l.memeReserve) / 10 ** memeDecimals;
  return meme > 0 ? quote / meme : null;
}

/** Graduation progress 0–1 from net real quote vs target. */
export function curveProgress(real: bigint, target: bigint): number | null {
  if (target <= 0n) return null;
  return Math.min(1, Number(real) / Number(target));
}

/** Move `address` fields arrive base64-encoded in GraphQL JSON for enum payloads. */
export function b64Address(v: string): string | null {
  try {
    const hex = Buffer.from(v, "base64").toString("hex");
    return hex.length === 64 ? `0x${hex}` : null;
  } catch { return null; }
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
