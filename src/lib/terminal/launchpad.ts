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
    label: "SuiPump",
    site: "https://suipump.org",
    network: "sui",
    factoryPackage: null,
    factoryObject: null,
    version: null,
    supportsCustomPair: false,
    pairTokens: ["SUI"],
    liquidity: { min: 1, max: 5_000, default: 10 },
    supply: { min: 1_000_000, max: 10_000_000_000, default: 1_000_000_000 },
  },
  {
    id: "maelstrom",
    label: "Maelstrom",
    site: "https://maelstrom.sui.io",
    network: "sui",
    factoryPackage: null,
    factoryObject: null,
    version: null,
    supportsCustomPair: true,
    pairTokens: ["SUI", "USDC", "BLAST", "DEEP", "WAL"],
    liquidity: { min: 1, max: 25_000, default: 25 },
    supply: { min: 1_000_000, max: 100_000_000_000, default: 1_000_000_000 },
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
};

export function resolveLaunchpad(value?: string | null): LaunchpadConfig {
  if (!value) return LAUNCHPAD;
  const raw = value.trim().toLowerCase();
  const needle = PAD_ALIASES[raw] ?? raw;
  return (
    LAUNCHPADS.find((pad) => pad.id === needle || pad.label.toLowerCase() === needle) ?? LAUNCHPAD
  );
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

export function resolvePairToken(pad: LaunchpadConfig, requested?: string | null): string {
  const fallback = pad.pairTokens[0] ?? "SUI";
  if (!requested) return fallback;
  const needle = requested.replace(/^\$/, "").trim().toUpperCase();
  if (!pad.supportsCustomPair) return fallback;
  return pad.pairTokens.includes(needle) ? needle : fallback;
}
