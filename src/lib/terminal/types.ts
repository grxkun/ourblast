// SPDX-License-Identifier: BUSL-1.1
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
  | "escrowHelp"
  | "unknown";

import type { FeePayout } from "./feePayout";

export interface LaunchConfiguration {
  name: string;
  symbol: string;
  description: string;
  image: string | null;
  imageName?: string;
  network: "sui";
  /** Launch platform id/label, e.g. "suipump.org". Configured in ./launchpad.ts. */
  launchpad: string;
  /** Token the bonding-curve LP is paired against. Pads without custom pairing use SUI. */
  pairToken: string;
  /** Starting LP size in the pairing token. */
  liquidity: number;
  /** Optional creator's first buy, in the pairing token. 0 = none. */
  devBuy: number;
  /** Token supply minted at launch. */
  totalSupply: number;
  /** Where the creator's share of the launchpad creator fee is paid. */
  feePayout: FeePayout;
  /** Perpsplexity market-backed position, when this is a perps launch. */
  perps?: import("./perpsParse").PerpsPositionRequest | null;
}

export interface ParsedIntent {
  name: TerminalIntentName;
  input: Record<string, string | number | import("./perpsParse").PerpsPositionRequest | null>;
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
  launchpad: string;
  tokenAddress: string;
  factoryAddress: string;
  transactionDigest: string;
  launchStatus: "BONDING" | "MIGRATED";
  tradeUrl?: string;
  explorerUrl?: string;
  launchedByX?: string;
}