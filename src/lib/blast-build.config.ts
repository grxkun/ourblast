export const BLAST_BUILD = {
  suiRelevanceThreshold: 60,
  suiNetwork: "mainnet",
  blastTokenType: "0x577a8addf60a34d4c705914ad066a3b28c3fc40d365ed0d9dfc408f29b4725d3::blast::BLAST",
  blastDecimals: 9,
  lockContractPackageId: null as string | null,
  freeLand: {
    base: 6,
    perVerifiedRepository: 1,
    builderScoreStep: 2_000,
    plotsPerScoreStep: 2,
  },
  expansionTiers: [
    { key: "block", label: "Builder Block", blast: 500, plots: 4 },
    { key: "quarter", label: "Builder Quarter", blast: 1_500, plots: 8 },
    { key: "district", label: "Builder District", blast: 5_000, plots: 16 },
  ],
  buildingUpgradeCosts: [100, 250, 500, 1_000, 2_500],
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

export function freeLandFor(builderScore: number, verifiedRepositories: number) {
  return BLAST_BUILD.freeLand.base
    + verifiedRepositories * BLAST_BUILD.freeLand.perVerifiedRepository
    + Math.floor(builderScore / BLAST_BUILD.freeLand.builderScoreStep) * BLAST_BUILD.freeLand.plotsPerScoreStep;
}

export function buildingUpgradePreview(developerLevel: number, blastAmount: number) {
  const purchasedLevels = BLAST_BUILD.buildingUpgradeCosts.filter((cost) => blastAmount >= cost).length;
  return {
    developerLevel,
    cityUpgradeLevel: purchasedLevels,
    displayLevel: developerLevel + purchasedLevels,
    nextCost: BLAST_BUILD.buildingUpgradeCosts[purchasedLevels] ?? null,
  };
}

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
