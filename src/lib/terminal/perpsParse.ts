/**
 * Shared parsing for Perpsplexity market-backed launch calls, used by both
 * the X launcher and the terminal command parser.
 */

export interface PerpsPositionRequest {
  /** Underlying market label, e.g. "NVDA". Null when the caller named none. */
  underlying: string | null;
  long: boolean;
  leverageBps: number;
  startingCapUsd: number | null;
}

/** "Underlying: NVDA" / "market = TSLA". */
const FIELD_UNDERLYING = /\b(?:underlying|market|asset)\s*(?:is\s+)?[:=]?\s*\$?([a-z0-9]{2,12})\b/i;
/** "Position: LONG" / "side short". */
const FIELD_POSITION = /\b(?:position|direction|side)\s*(?:is\s+)?[:=]?\s*(long|short)\b/i;
/** "Leverage: 5x" / "lev 10". */
const FIELD_LEVERAGE = /\b(?:leverage|lev)\s*(?:is\s+)?[:=]?\s*(\d{1,2})\s*x?\b/i;
/** Terminal style: "NVDA LONG 5x" with no labels. */
const BARE_POSITION = /\b([a-z0-9]{2,12})\s+(long|short)\s+(\d{1,2})x\b/i;
/** "Initial MC ~$4K" / "market cap: 4000". */
const FIELD_MC = /\b(?:initial\s*)?(?:market\s*cap|mc)\s*(?:is\s+)?[:=]?\s*~?\$?\s*([0-9]+(?:\.[0-9]+)?)\s*([kmb])?\b/i;

function removeSpan(text: string, match: RegExpMatchArray): string {
  return (text.slice(0, match.index) + " " + text.slice((match.index ?? 0) + match[0].length)).replace(/\s+/g, " ").trim();
}

/**
 * Reads Perpsplexity position fields out of the text and removes them so they
 * never land in the token name. Returns the cleaned text plus the position.
 */
export function extractPerps(text: string, isPerpsPad: boolean): { text: string; perps: PerpsPositionRequest | null } {
  let underlying: string | null = null;
  let long = true;
  let leverageBps = 10_000;
  let startingCapUsd: number | null = null;
  let sawField = false;

  const underlyingMatch = text.match(FIELD_UNDERLYING);
  if (underlyingMatch?.[1]) {
    underlying = underlyingMatch[1].toUpperCase();
    text = removeSpan(text, underlyingMatch);
    sawField = true;
  }
  const positionMatch = text.match(FIELD_POSITION);
  if (positionMatch?.[1]) {
    long = positionMatch[1].toLowerCase() !== "short";
    text = removeSpan(text, positionMatch);
    sawField = true;
  }
  const leverageMatch = text.match(FIELD_LEVERAGE);
  if (leverageMatch?.[1]) {
    const leverage = Number(leverageMatch[1]);
    if (leverage >= 1 && leverage <= 20) {
      leverageBps = leverage * 10_000;
      text = removeSpan(text, leverageMatch);
      sawField = true;
    }
  }
  const mcMatch = text.match(FIELD_MC);
  if (mcMatch?.[1]) {
    const scale = { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[(mcMatch[2] ?? "").toLowerCase() as "k" | "m" | "b"] ?? 1;
    startingCapUsd = Math.round(Number(mcMatch[1]) * scale);
    text = removeSpan(text, mcMatch);
    sawField = true;
  }
  // Label-free form ("NVDA LONG 5x") — only trusted when the pad is Perpsplexity.
  if (isPerpsPad && (!underlying || !positionMatch)) {
    const bare = text.match(BARE_POSITION);
    if (bare?.[1] && bare[2] && bare[3]) {
      underlying ??= bare[1].toUpperCase();
      if (!positionMatch) long = bare[2].toLowerCase() !== "short";
      if (!leverageMatch) {
        const leverage = Number(bare[3]);
        if (leverage >= 1 && leverage <= 20) leverageBps = leverage * 10_000;
      }
      text = removeSpan(text, bare);
      sawField = true;
    }
  }

  if (!sawField) return { text, perps: null };
  return { text, perps: { underlying, long, leverageBps, startingCapUsd } };
}
