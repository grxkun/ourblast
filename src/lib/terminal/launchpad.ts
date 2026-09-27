/**
 * Single place that defines which launch platforms the terminal and the X bot can target.
 * Add a pad here and every card, reply and adapter follows.
 */
export interface LaunchpadConfig {
  id: string;
  label: string;
  site: string;
  network: "sui";
  /** Move package / factory object, filled in once the platform API is wired up. */
  factoryPackage: string | null;
  factoryObject: string | null;
  version: string | null;
  /** True only when a verified launch API / contract integration exists. Never fake this. */
  integrated: boolean;
  /** Pads like Maelstrom ("strom") can pair the bonding-curve LP against a chosen token. */
  supportsCustomPair: boolean;
  /** Tokens the pad can pair the LP against. First entry is the default. */
  pairTokens: string[];
  /** Starting LP size, denominated in the pairing token. */
  liquidity: { min: number; max: number; default: number };
  /** Token supply minted at launch. */
  supply: { min: number; max: number; default: number };
}

export const LAUNCHPADS: LaunchpadConfig[] = [
  {
    id: "suipump",
    label: "Suipump",
    site: "https://suipump.org",
    network: "sui",
    // Public V17 bonding-curve package and its shared launch-issuer registry.
    factoryPackage: "0xb205fea41ccedac051bc66498e6ca68cb802c4a6ea06da12e524bed09c80d9b0",
    factoryObject: "0xb622741bfcfd6ef13b40c2d5c2adc8d796f68b3b1254fabaa571bffa3a91e875",
    version: "v17",
    integrated: true,
    supportsCustomPair: false,
    pairTokens: ["SUI"],
    liquidity: { min: 1, max: 5_000, default: 10 },
    supply: { min: 1_000_000, max: 10_000_000_000, default: 1_000_000_000 },
  },
  {
    id: "perpsplexity",
    label: "Perpsplexity",
    site: "https://perpsplexity.app",
    network: "sui",
    // Mainnet launchpad package + shared Launchpad object (perpsplexity.app).
    // OurBlast launches virtual pools (bonding curves) quoted in SUI.
    factoryPackage: "0xa0338d2361534919001ae21265ec6c66f30f85797beb0e0644be51fc2ce93142",
    factoryObject: "0x6131090639b7c4a5af741ae1163e480f0b2cf50e74823d7c2261b5a3a3d5a586",
    version: "virtual-pool-mainnet",
    integrated: true,
    supportsCustomPair: false,
    pairTokens: ["SUI"],
    liquidity: { min: 1, max: 5_000, default: 1 },
    supply: { min: 1_000_000_000, max: 1_000_000_000, default: 1_000_000_000 },
  },
  {
    id: "maelstrom",
    label: "Maelstrom",
    site: "https://maelstromfun.xyz",
    network: "sui",
    // Mainnet launchpad package (factory and router in one) + its shared
    // Launchpad object. Launches open a Cetus pool whose LP is locked forever.
    factoryPackage: "0xed1d6717ba00f452822039f295989bbaef6c10ce34a29ac8f28ea6de2867d6c6",
    factoryObject: "0x61a4aacb5b0beea23a6e3fb789b48a6f1b6f95b1c8a98b8d1bd5112b4666c5c4",
    version: "launchpad-v2",
    integrated: true,
    supportsCustomPair: false,
    pairTokens: ["SUI"],
    liquidity: { min: 1, max: 25_000, default: 1 },
    supply: { min: 1_000_000_000, max: 1_000_000_000, default: 1_000_000_000 },
  },

  {
    id: "ript",
    label: "RIPT",
    site: "https://ript.fun",
    network: "sui",
    factoryPackage: null,
    factoryObject: null,
    version: null,
    integrated: false,
    supportsCustomPair: false,
    pairTokens: ["SUI"],
    liquidity: { min: 1, max: 5_000, default: 10 },
    supply: { min: 1_000_000, max: 10_000_000_000, default: 1_000_000_000 },
  },
  {
    id: "blastfun",
    label: "Blast.fun",
    site: "https://blast.fun",
    network: "sui",
    // memez-fun router + shared Config object used by the official blast.fun form.
    factoryPackage: "0xa36cd2f2ab1d47c884cf564df780691a461e05bda1db1528772f8d0694cb184d",
    factoryObject: "0x9c665993f61a902475b083036da75240aa203bb874ebce4031810b589e485a61",
    version: "memez-fun-sdk-19.1.0",
    integrated: true,
    supportsCustomPair: false,
    pairTokens: ["SUI"],
    liquidity: { min: 1, max: 5_000, default: 10 },
    supply: { min: 1_000_000, max: 10_000_000_000, default: 1_000_000_000 },
  },
  {
    id: "vicefun",
    label: "ViceFun",
    site: "https://vice.fun",
    network: "sui",
    factoryPackage: null,
    factoryObject: null,
    version: null,
    integrated: false,
    supportsCustomPair: false,
    pairTokens: ["SUI"],
    liquidity: { min: 1, max: 5_000, default: 10 },
    supply: { min: 1_000_000, max: 10_000_000_000, default: 1_000_000_000 },
  },
];

/** Default pad used when a command does not name one. */
export const LAUNCHPAD: LaunchpadConfig = LAUNCHPADS[0] as LaunchpadConfig;

/** Short aliases people actually type / tweet. */
const PAD_ALIASES: Record<string, string> = {
  strom: "maelstrom",
  mael: "maelstrom",
  pump: "suipump",
  "suipump.org": "suipump",
  "sui pump": "suipump",
  ript: "ript",
  "ript.fun": "ript",
  blast: "blastfun",
  "blast.fun": "blastfun",
  blastfun: "blastfun",
  vice: "vicefun",
  "vice.fun": "vicefun",
  vicefun: "vicefun",
  perpsplexity: "perpsplexity",
  "perpsplexity.app": "perpsplexity",
  "@perpsplexity": "perpsplexity",
  perps: "perpsplexity",
  ppx: "perpsplexity",
};

/** Classic Levenshtein distance — small inputs only, fine for pad names. */
function editDistance(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0] as number;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = dp[j] as number;
      dp[j] = Math.min(cur + 1, (dp[j - 1] as number) + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return dp[b.length] as number;
}

/** Consonant skeleton: vowel swaps ("Peropelxity") collapse to the same shape. */
const skeleton = (value: string) => value.replace(/[aeiou.]/g, "");

/**
 * Matches a typed pad name to a supported launchpad, tolerating typos.
 * Returns null when nothing is close enough — callers then use the default,
 * and a misspelling of a real pad (e.g. "Peropelxity") still resolves to it
 * instead of silently falling back.
 */
export function matchLaunchpad(value?: string | null): LaunchpadConfig | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase().replace(/^@/, "");
  if (!raw) return null;
  const needle = PAD_ALIASES[raw] ?? raw;
  const exact = LAUNCHPADS.find((pad) => pad.id === needle || pad.label.toLowerCase() === needle);
  if (exact) return exact;
  if (raw.length < 5) return null;
  let best: LaunchpadConfig | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const pad of LAUNCHPADS) {
    for (const candidate of [pad.id, pad.label.toLowerCase()]) {
      if (candidate[0] !== raw[0] || Math.abs(candidate.length - raw.length) > 3) continue;
      const score = Math.min(editDistance(raw, candidate), editDistance(skeleton(raw), skeleton(candidate)));
      const limit = candidate.length >= 8 ? 3 : 2;
      if (score <= limit && score < bestScore) {
        best = pad;
        bestScore = score;
      }
    }
  }
  return best;
}

export function resolveLaunchpad(value?: string | null): LaunchpadConfig {
  return matchLaunchpad(value) ?? LAUNCHPAD;
}

export function padByLabel(label: string): LaunchpadConfig {
  return resolveLaunchpad(label);
}

/**
 * Normalises a requested LP pairing against what the pad can do.
 * Pads without custom pairing always fall back to SUI.
 */
/**
 * Public token page on the pad, e.g. https://suipump.org/token/0x440c…4945
 * `ref` is the coin object id / coin type the pad indexes the token under.
 */
export function tokenPageUrl(pad: LaunchpadConfig, ref: string): string {
  return `${pad.site.replace(/\/$/, "")}/token/${ref}`;
}

/** Public pool / chart page on the pad for a launched token. */
export function poolPageUrl(pad: LaunchpadConfig, ref: string): string {
  return `${pad.site.replace(/\/$/, "")}/pool/${ref}`;
}

export function resolvePairToken(pad: LaunchpadConfig, requested?: string | null): string {
  const fallback = pad.pairTokens[0] ?? "SUI";
  if (!requested) return fallback;
  const needle = requested.replace(/^\$/, "").trim().toUpperCase();
  if (!pad.supportsCustomPair) return fallback;
  return pad.pairTokens.includes(needle) ? needle : fallback;
}
