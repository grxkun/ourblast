import { LAUNCHPAD, type LaunchpadConfig } from "./launchpad";
import type { LaunchConfiguration, TerminalToolResult } from "./types";

export interface LaunchpadAdapter {
  getFactory(): Promise<LaunchpadConfig>;
  createToken(config: LaunchConfiguration): Promise<TerminalToolResult>;
  launchToken(config: LaunchConfiguration): Promise<TerminalToolResult>;
  getBondingCurve(symbol: string): Promise<TerminalToolResult>;
  getLaunchStatus(symbol: string): Promise<TerminalToolResult>;
  getMigrationStatus(symbol: string): Promise<TerminalToolResult>;
}

const unavailable = (tool: TerminalToolResult["tool"], message: string): TerminalToolResult => ({
  tool,
  status: "NOT_IMPLEMENTED",
  message,
  data: { network: LAUNCHPAD.network, launchpad: LAUNCHPAD.label, factoryConfigured: false },
});

export const launchpadAdapter: LaunchpadAdapter = {
  async getFactory() {
    return LAUNCHPAD;
  },
  async createToken(config) {
    return unavailable("createToken", `${config.name} is configured, but ${LAUNCHPAD.label} token creation is not connected yet.`);
  },
  async launchToken(config) {
    return unavailable("launchToken", `${config.name} is ready for review. ${LAUNCHPAD.label} deployment is not connected yet.`);
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
