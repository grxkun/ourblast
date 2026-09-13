import { BLAST_BUILD, type BuildingType } from "./blast-build.config";

export type RepoSignal = {
  key: string;
  label: string;
  strength: "strong" | "medium" | "weak";
  points: number;
  evidence: string;
};

export type RepositoryEvidence = {
  name: string;
  description?: string | null;
  topics: string[];
  languages: Record<string, number>;
  treePaths: string[];
  moveToml?: string;
  packageJson?: string;
  cargoToml?: string;
  readme?: string;
  isFork: boolean;
  archived: boolean;
  stars: number;
  forks: number;
  contributors: number;
  commits: number;
  pullRequests: number;
  mergedPullRequests: number;
  issuesResolved: number;
  createdAt?: string | null;
  pushedAt?: string | null;
};

const add = (signals: RepoSignal[], signal: RepoSignal, pass: boolean) => {
  if (pass && !signals.some((item) => item.key === signal.key)) signals.push(signal);
};

export function classifyBuilding(repo: RepositoryEvidence): BuildingType {
  const text = `${repo.name} ${repo.description ?? ""} ${repo.topics.join(" ")} ${repo.readme ?? ""}`.toLowerCase();
  if (/wallet|keyring|signer/.test(text)) return "wallet";
  if (/defi|swap|dex|lend|liquidity|staking|yield/.test(text)) return "defi";
  if (/game|gaming|arcade|quest/.test(text)) return "gaming";
  if (/nft|collectible|marketplace/.test(text)) return "nft";
  if (/bot|automation|agent/.test(text)) return "automation";
  if (/indexer|rpc|node|infra|oracle|bridge/.test(text)) return "infrastructure";
  if (/sdk|cli|tool|template|starter|framework/.test(text)) return "tooling";
  if (/social|community|chat/.test(text)) return "social";
  if (/meme|memecoin/.test(text)) return "meme";
  if ((repo.languages['Move'] ?? 0) > 0) return "move";
  return "dapp";
}

export function scoreSuiRepository(repo: RepositoryEvidence) {
  const signals: RepoSignal[] = [];
  const paths = repo.treePaths.map((path) => path.toLowerCase());
  const source = `${repo.moveToml ?? ""}\n${repo.packageJson ?? ""}\n${repo.cargoToml ?? ""}\n${repo.readme ?? ""}`.toLowerCase();
  const topicSet = new Set(repo.topics.map((topic) => topic.toLowerCase()));

  add(signals, { key: "move_toml_sui", label: "Sui Move package", strength: "strong", points: 28, evidence: "Move.toml declares a Sui framework dependency" }, Boolean(repo.moveToml && /mystenlabs\/sui|(^|\n)\s*sui\s*=|sui_system/i.test(repo.moveToml)));
  add(signals, { key: "move_sources", label: "Sui Move source", strength: "strong", points: 22, evidence: "Move sources and a package manifest are present" }, paths.some((path) => path.endsWith(".move")) && paths.some((path) => path.endsWith("move.toml")));
  add(signals, { key: "mysten_sdk", label: "Mysten Sui SDK", strength: "strong", points: 24, evidence: "Uses an official Mysten Sui JavaScript package" }, /@mysten\/(sui|sui\.js|dapp-kit|wallet-kit)/.test(source));
  add(signals, { key: "rust_sui_sdk", label: "Sui Rust SDK", strength: "strong", points: 22, evidence: "Cargo dependencies reference Sui SDK crates" }, /sui-(sdk|types|json-rpc)|mystenlabs\/sui/.test(repo.cargoToml?.toLowerCase() ?? ""));
  add(signals, { key: "sui_code", label: "Sui-specific code", strength: "strong", points: 18, evidence: "Code references Sui modules, clients, package IDs, or network endpoints" }, /sui::|suiclient|fullnode\.(mainnet|testnet|devnet)\.sui\.io|0x[a-f0-9]{40,}::/.test(source));
  add(signals, { key: "sui_topics", label: "Sui repository topics", strength: "medium", points: 12, evidence: "Repository topics identify Sui or Sui Move" }, ["sui", "sui-network", "sui-move", "move-lang"].some((topic) => topicSet.has(topic)));
  add(signals, { key: "sui_readme", label: "Sui project documentation", strength: "medium", points: 10, evidence: "README explicitly describes a Sui project or integration" }, /\bsui (network|blockchain|dapp|move|ecosystem|package|wallet)\b/.test(repo.readme?.toLowerCase() ?? ""));
  add(signals, { key: "move_language", label: "Move language", strength: "weak", points: 5, evidence: "GitHub detects Move source code" }, (repo.languages['Move'] ?? 0) > 0);
  add(signals, { key: "generic_chain", label: "Blockchain terminology", strength: "weak", points: 2, evidence: "Description includes generic blockchain language" }, /blockchain|web3|smart contract/.test(`${repo.description ?? ""} ${repo.readme ?? ""}`.toLowerCase()));

  const hasStrong = signals.some((signal) => signal.strength === "strong");
  const hasMediumPair = signals.filter((signal) => signal.strength === "medium").length >= 2;
  let relevance = Math.min(100, signals.reduce((sum, signal) => sum + signal.points, 0));
  if (!hasStrong && !hasMediumPair) relevance = Math.min(relevance, BLAST_BUILD.suiRelevanceThreshold - 1);
  if (repo.isFork || repo.archived) relevance = Math.round(relevance * 0.45);

  const ageDays = repo.createdAt ? Math.max(1, (Date.now() - Date.parse(repo.createdAt)) / 86_400_000) : 1;
  const daysSincePush = repo.pushedAt ? Math.max(0, (Date.now() - Date.parse(repo.pushedAt)) / 86_400_000) : 9999;
  const suspiciousBurst = ageDays < 14 && repo.commits > 250;
  const activity = Math.min(100,
    Math.log10(repo.commits + 1) * 22 +
    Math.min(repo.mergedPullRequests, 30) * 1.2 +
    Math.min(repo.contributors, 12) * 2 +
    (daysSincePush < 30 ? 20 : daysSincePush < 180 ? 10 : 0),
  );
  const developmentScore = Math.round((suspiciousBurst ? activity * 0.55 : activity) * (repo.isFork ? 0.3 : 1));
  const qualityScore = Math.round(Math.min(100,
    (repo.readme && repo.readme.length > 600 ? 28 : 8) +
    (paths.some((path) => path.startsWith(".github/workflows/")) ? 24 : 0) +
    (paths.some((path) => /(^|\/)license(\.|$)/.test(path)) ? 18 : 0) +
    Math.log10(repo.stars + 1) * 10 + Math.min(repo.contributors, 10) * 2,
  ));
  const verified = relevance >= BLAST_BUILD.suiRelevanceThreshold && hasStrong && !repo.isFork;
  const buildingLevel = Math.max(1, Math.min(20, Math.round((developmentScore * 0.5 + relevance * 0.35 + qualityScore * 0.15) / 6)));
  return { signals, relevance, verified, developmentScore, qualityScore, buildingLevel, buildingType: classifyBuilding(repo), suspiciousBurst };
}
