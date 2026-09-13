export const BLAST_BUILD = {
  suiRelevanceThreshold: 60,
  suiNetwork: "mainnet",
  blastTokenType: null as string | null,
  scoring: {
    suiRelevance: 0.3,
    developmentActivity: 0.3,
    repositoryQuality: 0.15,
    openSourceActivity: 0.15,
    suiVerification: 0.1,
  },
  cityTiers: [
    { level: 1, key: "foundation", label: "Foundation" },
    { level: 5, key: "village", label: "Builder Village" },
    { level: 10, key: "sui-town", label: "Sui Town" },
    { level: 20, key: "meme-city", label: "Meme City" },
    { level: 30, key: "sui-capital", label: "Sui Capital" },
    { level: 50, key: "metropolis", label: "Sui Metropolis" },
    { level: 100, key: "sui-world", label: "Sui World" },
  ],
} as const;

export type BuildingType =
  | "dapp"
  | "move"
  | "nft"
  | "defi"
  | "gaming"
  | "infrastructure"
  | "tooling"
  | "automation"
  | "social"
  | "meme"
  | "wallet";

export const BUILDING_LABELS: Record<BuildingType, string> = {
  dapp: "DApp Tower",
  move: "Move Factory",
  nft: "NFT Gallery",
  defi: "DeFi Bank",
  gaming: "Game Center",
  infrastructure: "Infrastructure Tower",
  tooling: "Developer Workshop",
  automation: "Automation Lab",
  social: "Social Plaza",
  meme: "Meme Studio",
  wallet: "Wallet Hub",
};

export function cityTier(level: number) {
  return [...BLAST_BUILD.cityTiers].reverse().find((tier) => level >= tier.level) ?? BLAST_BUILD.cityTiers[0];
}
