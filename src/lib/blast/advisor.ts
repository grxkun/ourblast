// SPDX-License-Identifier: BUSL-1.1
/** Planning math only: never an executable quote or deployed contract configuration. */
export const ADVISOR_HELP = "Blast Launch Advisor — draft only\nDescribe your token's purpose, funding goal and need for refunds or immediate trading.\n/advisor plan launch $TOKEN for our game\n/advisor presale 100000 400000000 200000000 60000\n(advised inputs: target SUI, buyer tokens, pool tokens, pool SUI)\n/advisor curve 600000000 1000 3000 200000000 2400\n(inputs: curve tokens, virtual SUI, target real SUI, pool tokens, pool real SUI)\n/advisor inspect 0x… (presale or curve object ID)\nNo launch, signature or purchase is made.";

export function isAdvisorCommand(text: string): boolean {
  return /^(?:\/?advisor(?:@\w+)?\b|plan\s+launch\b)/i.test(text.trim());
}
export function advisorPrompt(text: string): string {
  return text.trim().replace(/^\/?advisor(?:@\w+)?\s*/i, "");
}
export function presaleModel(target: number, buyers: number, poolTokens: number, poolQuote: number) {
  if (![target, buyers, poolTokens, poolQuote].every((n) => Number.isFinite(n) && n > 0) || poolQuote > target) throw new Error("Positive inputs required; pool SUI cannot exceed the target.");
  const salePrice = target / buyers, poolPrice = poolQuote / poolTokens;
  return { salePrice, poolPrice, gap: poolPrice / salePrice - 1, exactFillTokensPer100Sui: 100 / salePrice, overflowFillAt2x: 0.5, quoteOutsidePool: target - poolQuote };
}
export function curveModel(inventory: number, virtual: number, target: number, poolTokens: number, poolQuote: number) {
  if (![inventory, virtual, target, poolTokens, poolQuote].every((n) => Number.isFinite(n) && n > 0) || poolQuote > target) throw new Error("Positive inputs required; pool real SUI cannot exceed the real target.");
  const remaining = inventory * virtual / (virtual + target), terminalPrice = (virtual + target) / remaining;
  const poolPrice = poolQuote / poolTokens;
  return { openingPrice: virtual / inventory, remaining, terminalPrice, poolPrice, gap: poolPrice / terminalPrice - 1, quoteOutsidePool: target - poolQuote };
}
const fmt = (n: number) => n.toLocaleString("en-US", { maximumSignificantDigits: 8 });
export function planningReply(prompt: string): string | null {
  const m = prompt.match(/^(presale|curve)\s+([\d.\s]+)$/i);
  if (!m) return null;
  const values = (m[2] ?? "").trim().split(/\s+/).map(Number);
  try {
    if (m[1]?.toLowerCase() === "presale" && values.length === 4) {
      const [target = 0, buyers = 0, pool = 0, quote = 0] = values;
      const p = presaleModel(target, buyers, pool, quote);
      return `Draft presale scenario (your inputs; fees excluded)\nSale: ${fmt(p.salePrice)} SUI/token\nNominal pool: ${fmt(p.poolPrice)} SUI/token\nPool/sale gap: ${fmt(p.gap * 100)}%\nAt exact fill, 100 SUI → ${fmt(p.exactFillTokensPer100Sui)} tokens.\nAt 2× overflow, a 100 SUI commitment fills 50 SUI and refunds 50 SUI after successful migration/claim. Hard-cap sales differ.\nOutside pool: ${fmt(p.quoteOutsidePool)} SUI BEFORE protocol fees and other payouts, not guaranteed treasury cash.\nTarget miss: settlement/claims required for refunds. Vesting may restrict exits.\nhttps://docs.blast.fun/teams/planning/`;
    }
    if (m[1]?.toLowerCase() === "curve" && values.length === 5) {
      const [inventory = 0, virtual = 0, target = 0, pool = 0, quote = 0] = values;
      const p = curveModel(inventory, virtual, target, pool, quote);
      return `Draft curve scenario (buy-only approximation; zero fees/burn; NOT a live quote)\nOpening: ${fmt(p.openingPrice)} SUI/token\nAt target: ${fmt(p.terminalPrice)} SUI/token\nRemaining curve inventory: ${fmt(p.remaining)} tokens\nNominal pool: ${fmt(p.poolPrice)} SUI/token\nMigration price gap: ${fmt(p.gap * 100)}%\nOutside pool: ${fmt(p.quoteOutsidePool)} REAL SUI before fees/other payouts. Virtual ${fmt(virtual)} SUI is never spendable.\nNo target-miss refund. Sells reduce progress; graduation requires migration. Pool price is not guaranteed exit proceeds.\nFull supply/allocation and deployment verification remain open.\nhttps://docs.blast.fun/launchpad/builder/`;
    }
    return ADVISOR_HELP;
  } catch (e) { return `Draft rejected: ${e instanceof Error ? e.message : "Invalid inputs"}`; }
}

export function minimumSnipeOutput(expected: bigint, slippagePercent: number): bigint {
  if (expected <= 0n || !Number.isFinite(slippagePercent) || slippagePercent < 0.1 || slippagePercent > 50) throw new Error("Invalid output or slippage");
  const min = expected * BigInt(Math.floor((100 - slippagePercent) * 100)) / 10_000n;
  if (min <= 0n) throw new Error("Trade output is too small to protect");
  return min;
}