import { LAUNCHPAD, resolveLaunchpad } from "./launchpad";
import { FEE_SUMMARY, describeGasPolicy, gasPayerFor } from "./fees";
import { describeLaunchSettings, normalizeLaunchSettings } from "./launchSettings";
import { launchpadAdapter } from "./launchpadAdapter";
import type { LaunchConfiguration, ParsedIntent, TerminalAgentContext, TerminalIntentName, TerminalToolResult } from "./types";

export type TerminalTool = (intent: ParsedIntent, context: TerminalAgentContext) => Promise<TerminalToolResult>;

const walletRequired = (tool: TerminalIntentName, context: TerminalAgentContext): TerminalToolResult | null =>
  context.walletConnected ? null : { tool, status: "NOT_CONNECTED", message: "Connect your Sui wallet first." };

const numberInput = (value: string | number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export function launchFromIntent(intent: ParsedIntent): { launch: LaunchConfiguration; notes: string[] } | null {
  const name = String(intent.input["name"] ?? "").trim().slice(0, 64);
  const symbol = String(intent.input["symbol"] ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10);
  if (!name || !symbol) return null;
  const pad = resolveLaunchpad(typeof intent.input["launchpad"] === "string" ? (intent.input["launchpad"] as string) : null);
  const settings = normalizeLaunchSettings(pad, {
    pairToken: typeof intent.input["pairToken"] === "string" ? (intent.input["pairToken"] as string) : null,
    liquidity: numberInput(intent.input["liquidity"]),
    devBuy: numberInput(intent.input["devBuy"]),
    totalSupply: numberInput(intent.input["totalSupply"]),
  });
  return {
    launch: {
      name,
      symbol,
      description: "",
      image: null,
      network: "sui",
      launchpad: pad.label,
      pairToken: settings.pairToken,
      liquidity: settings.liquidity,
      devBuy: settings.devBuy,
      totalSupply: settings.totalSupply,
    },
    notes: settings.notes,
  };
}

const launchTool: TerminalTool = async (intent, context) => {
  const prepared = launchFromIntent(intent);
  if (!prepared) return { tool: intent.name, status: "FAILED", message: "Include both a token name and symbol, for example: launch $DOG Sui Dog." };
  const { launch, notes } = prepared;
  const summary = ` ${describeLaunchSettings(launch)} on ${launch.launchpad}.`;
  return {
    tool: intent.name,
    status: context.walletConnected ? "READY" : "NOT_CONNECTED",
    message:
      (context.walletConnected
        ? "Launch configuration prepared. Review every field before continuing."
        : "Launch configuration prepared. Connect your Sui wallet before launching.") +
      summary +
      ` ${FEE_SUMMARY} ${describeGasPolicy(context.source)}` +
      (notes.length ? ` ${notes.join(" ")}` : ""),
    data: { notes, gasPayer: gasPayerFor(context.source) },
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
