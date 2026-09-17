export const TERMINAL_STATUSES = [
  "NOT_CONNECTED",
  "READY",
  "AWAITING_SIGNATURE",
  "SUBMITTING",
  "CONFIRMED",
  "FAILED",
  "NOT_IMPLEMENTED",
] as const;

export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

export type TerminalIntentName =
  | "createToken"
  | "launchToken"
  | "getToken"
  | "getWallet"
  | "getPortfolio"
  | "getLaunches"
  | "getBondingCurve"
  | "buyToken"
  | "sellToken"
  | "getTransaction"
  | "unknown";

export interface LaunchConfiguration {
  name: string;
  symbol: string;
  description: string;
  image: string | null;
  imageName?: string;
  network: "sui";
  launchpad: "blast.fun";
}

export interface ParsedIntent {
  name: TerminalIntentName;
  input: Record<string, string | number | null>;
  confidence: number;
  raw: string;
}

export interface TerminalToolResult {
  tool: TerminalIntentName;
  status: TerminalStatus;
  message: string;
  data?: Record<string, unknown>;
  launch?: LaunchConfiguration;
}

export interface TerminalEntry {
  id: string;
  command: string;
  intent: TerminalIntentName;
  result: TerminalToolResult;
  createdAt: string;
}

export interface TerminalAgentContext {
  walletConnected: boolean;
  walletAddress: string | null;
  source: "terminal" | "x";
  xUsername?: string;
}

export interface DeploymentResult {
  name: string;
  symbol: string;
  network: "sui";
  launchpad: "blast.fun";
  tokenAddress: string;
  factoryAddress: string;
  transactionDigest: string;
  launchStatus: "BONDING" | "MIGRATED";
  tradeUrl?: string;
  explorerUrl?: string;
  launchedByX?: string;
}