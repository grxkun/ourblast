import { LAUNCHPAD, resolveLaunchpad, resolvePairToken } from "./launchpad";
import { launchpadAdapter } from "./launchpadAdapter";
import type { LaunchConfiguration, ParsedIntent, TerminalAgentContext, TerminalIntentName, TerminalToolResult } from "./types";

export type TerminalTool = (intent: ParsedIntent, context: TerminalAgentContext) => Promise<TerminalToolResult>;

const walletRequired = (tool: TerminalIntentName, context: TerminalAgentContext): TerminalToolResult | null =>
  context.walletConnected ? null : { tool, status: "NOT_CONNECTED", message: "Connect your Sui wallet first." };

export function launchFromIntent(intent: ParsedIntent): LaunchConfiguration | null {
  const name = String(intent.input["name"] ?? "").trim().slice(0, 64);
  const symbol = String(intent.input["symbol"] ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10);
  if (!name || !symbol) return null;
  const pad = resolveLaunchpad(typeof intent.input["launchpad"] === "string" ? (intent.input["launchpad"] as string) : null);
  const pairToken = resolvePairToken(pad, typeof intent.input["pairToken"] === "string" ? (intent.input["pairToken"] as string) : null);
  return { name, symbol, description: "", image: null, network: "sui", launchpad: pad.label, pairToken };
}

const launchTool: TerminalTool = async (intent, context) => {
  const launch = launchFromIntent(intent);
  if (!launch) return { tool: intent.name, status: "FAILED", message: "Include both a token name and symbol, for example: launch $DOG Sui Dog." };
  const pad = resolveLaunchpad(launch.launchpad);
  const requested = typeof intent.input["pairToken"] === "string" ? (intent.input["pairToken"] as string).toUpperCase() : null;
  const pairNote = requested && requested !== launch.pairToken
    ? ` ${pad.label} cannot pair against $${requested} yet, so the LP is set to $${launch.pairToken}.`
    : ` LP pairing: $${launch.pairToken}.`;
  return {
    tool: intent.name,
    status: context.walletConnected ? "READY" : "NOT_CONNECTED",
    message: (context.walletConnected ? "Launch configuration prepared. Review every field before continuing." : "Launch configuration prepared. Connect your Sui wallet before launching.") + pairNote,
    launch,
  };
};

const unavailableRead = (tool: TerminalIntentName, label: string): TerminalToolResult => ({ tool, status: "NOT_IMPLEMENTED", message: `${label} is coming soon / not connected.` });

export const terminalTools: Record<Exclude<TerminalIntentName, "unknown">, TerminalTool> = {
  createToken: launchTool,
  launchToken: launchTool,
  getToken: async (intent) => launchpadAdapter.getLaunchStatus(String(intent.input["symbol"] ?? "")),
  getWallet: async (_intent, context) => context.walletConnected
    ? { tool: "getWallet", status: "READY", message: `Sui wallet connected: ${context.walletAddress ?? "Connected"}.`, data: { address: context.walletAddress } }
    : { tool: "getWallet", status: "NOT_CONNECTED", message: "Connect your Sui wallet first." },
  getPortfolio: async (_intent, context) => walletRequired("getPortfolio", context) ?? unavailableRead("getPortfolio", "Portfolio indexing"),
  getLaunches: async (_intent, context) => walletRequired("getLaunches", context) ?? unavailableRead("getLaunches", `${LAUNCHPAD.label} launch history`),
  getBondingCurve: async (intent) => launchpadAdapter.getBondingCurve(String(intent.input["symbol"] ?? "")),
  buyToken: async (_intent, context) => walletRequired("buyToken", context) ?? unavailableRead("buyToken", `${LAUNCHPAD.label} trading`),
  sellToken: async (_intent, context) => walletRequired("sellToken", context) ?? unavailableRead("sellToken", `${LAUNCHPAD.label} trading`),
  getTransaction: async () => unavailableRead("getTransaction", "Sui transaction lookup"),
};

export async function executeTerminalIntent(intent: ParsedIntent, context: TerminalAgentContext): Promise<TerminalToolResult> {
  if (intent.name === "unknown") return { tool: "unknown", status: "FAILED", message: "I couldn't map that request to a supported action. Try a suggested command." };
  return terminalTools[intent.name](intent, context);
}
