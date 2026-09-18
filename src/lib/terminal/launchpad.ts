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
  /** Pads like Maelstrom ("strom") can pair the bonding-curve LP against a chosen token. */
  supportsCustomPair: boolean;
  /** Tokens the pad can pair the LP against. First entry is the default. */
  pairTokens: string[];
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
  },
];

/** Default pad used when a command does not name one. */
export const LAUNCHPAD: LaunchpadConfig = LAUNCHPADS[0] as LaunchpadConfig;

export function resolveLaunchpad(value?: string | null): LaunchpadConfig {
  if (!value) return LAUNCHPAD;
  const needle = value.trim().toLowerCase();
  return (
    LAUNCHPADS.find((pad) => pad.id === needle || pad.label.toLowerCase() === needle) ?? LAUNCHPAD
  );
}
