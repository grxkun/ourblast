import type { LaunchConfiguration, TerminalToolResult } from "./types";

export interface BlastFunConfig {
  network: "sui";
  factoryPackage: string | null;
  factoryObject: string | null;
  version: string | null;
}

export interface BlastFunAdapter {
  getFactory(): Promise<BlastFunConfig>;
  createToken(config: LaunchConfiguration): Promise<TerminalToolResult>;
  launchToken(config: LaunchConfiguration): Promise<TerminalToolResult>;
  getBondingCurve(symbol: string): Promise<TerminalToolResult>;
  getLaunchStatus(symbol: string): Promise<TerminalToolResult>;
  getMigrationStatus(symbol: string): Promise<TerminalToolResult>;
}

export const blastFunConfig: BlastFunConfig = {
  network: "sui",
  factoryPackage: null,
  factoryObject: null,
  version: null,
};

const unavailable = (tool: TerminalToolResult["tool"], message: string): TerminalToolResult => ({
  tool,
  status: "NOT_IMPLEMENTED",
  message,
  data: { network: blastFunConfig.network, factoryConfigured: false },
});

export const blastFunAdapter: BlastFunAdapter = {
  async getFactory() {
    return blastFunConfig;
  },
  async createToken(config) {
    return unavailable("createToken", `${config.name} is configured, but Blast.fun token creation is not connected yet.`);
  },
  async launchToken(config) {
    return unavailable("launchToken", `${config.name} is ready for review. Blast.fun deployment is not connected yet.`);
  },
  async getBondingCurve(symbol) {
    return unavailable("getBondingCurve", `$${symbol || "TOKEN"} bonding-curve data is coming soon / not connected.`);
  },
  async getLaunchStatus(symbol) {
    return unavailable("getToken", `$${symbol} launch status is coming soon / not connected.`);
  },
  async getMigrationStatus(symbol) {
    return unavailable("getToken", `$${symbol} migration status is coming soon / not connected.`);
  },
};