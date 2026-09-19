import { LAUNCHPAD, resolveLaunchpad, tokenPageUrl } from "./launchpad";
import type { DeploymentResult, TerminalToolResult } from "./types";

/** The X account that receives launch calls, e.g. "@ourblastbot launch $DOG Sui Dog". */
export const X_BOT_HANDLE = "@ourblastbot";
export const X_BOT_SITE = "https://ourblast.xyz";

export interface XMentionPayload {
  postId: string;
  username: string;
  text: string;
}

export interface XMentionOutcome {
  postId: string;
  username: string;
  text: string;
  intent: string;
  status: string;
  reply: string;
  posted: boolean;
  replyPostId?: string | null;
  postError?: string | null;
}

const terminalLink = (params?: Record<string, string>) => {
  const url = new URL("/terminal", X_BOT_SITE);
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
  return url.toString();
};

/** X hard-limits a post to 280 characters. */
const fit = (text: string) => (text.length <= 280 ? text : `${text.slice(0, 277).trimEnd()}…`);

const compact = (value: number) => {
  if (value >= 1_000_000_000) return `${+(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${+(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${+(value / 1_000).toFixed(2)}K`;
  return String(value);
};

/**
 * Reply for a launch that is confirmed on-chain: deployed token info plus the
 * pad's public token page. Only ever used with a real deployment record.
 */
export function composeDeployedReply(
  deployment: DeploymentResult,
  extras: { totalSupply?: number; liquidity?: number; pairToken?: string } = {},
): string {
  const pad = resolveLaunchpad(deployment.launchpad);
  const page = deployment.tradeUrl ?? tokenPageUrl(pad, deployment.tokenAddress);
  const supply = extras.totalSupply ? ` Supply ${compact(extras.totalSupply)}.` : "";
  // X allows only one cashtag per post, so the pairing token stays plain text.
  const lp = extras.liquidity ? ` LP ${extras.liquidity} ${extras.pairToken ?? "SUI"}.` : "";
  const curve = deployment.launchStatus === "MIGRATED" ? " Curve migrated." : " Bonding curve is LIVE.";
  const head = `DEPLOYED on ${pad.label}: $${deployment.symbol} ${deployment.name} 🚀${supply}${lp}${curve} 0 launch fee.`;
  const tail = ` Token page: ${page}`;
  return fit(head.length + tail.length <= 280 ? head + tail : `DEPLOYED on ${pad.label}: $${deployment.symbol} ${deployment.name} 🚀${curve}${tail}`);
}

/** Never claims an on-chain launch happened unless a deployment record proves it. */
export function composeXReply(result: TerminalToolResult): string {
  const deployment = result.data?.["deployment"] as DeploymentResult | undefined;
  if (deployment?.tokenAddress && deployment.symbol) {
    return composeDeployedReply(deployment, {
      ...(result.launch ? { totalSupply: result.launch.totalSupply, liquidity: result.launch.liquidity, pairToken: result.launch.pairToken } : {}),
    });
  }

  const launch = result.launch;
  if (launch) {
    const link = terminalLink({
      symbol: launch.symbol,
      name: launch.name,
      pad: launch.launchpad,
      pair: launch.pairToken,
      lp: String(launch.liquidity),
      devbuy: String(launch.devBuy),
      supply: String(launch.totalSupply),
      ...(launch.feePayout.mode === "wallet" && launch.feePayout.wallet ? { feewallet: launch.feePayout.wallet } : {}),
      ...(launch.feePayout.mode === "x" && launch.feePayout.xUsername ? { feex: launch.feePayout.xUsername } : {}),
    });
    const pad = launch.launchpad || LAUNCHPAD.label;
    // X rejects a post carrying more than one cashtag, so only the launched token keeps its $.
    const pair = launch.pairToken && launch.pairToken !== "SUI" ? ` paired with ${launch.pairToken}` : "";
    const lp = ` LP ${launch.liquidity} ${launch.pairToken}.`;
    const rawNotes = Array.isArray(result.data?.["notes"]) ? (result.data["notes"] as string[]) : [];
    const note = rawNotes[0] ? ` ${rawNotes[0]}` : "";
    const head = `Okayyyy blasting a new token on ${pad}${pair}: $${launch.symbol} ${launch.name} 🚀${lp} 0 launch fee, gas on me.`;
    const tail = ` Sign it with your Sui wallet here, buy link drops right after: ${link}`;
    const padSite = resolveLaunchpad(launch.launchpad).site.replace(/^https?:\/\//, "");
    const page = ` Token page lands on ${padSite} the moment it's signed.`;
    // The link must survive; the note goes first, then the token-page line.
    for (const candidate of [head + note + page + tail, head + page + tail, head + note + tail, head + tail]) {
      if (candidate.length <= 280) return candidate;
    }
    return fit(head + tail);
  }

  switch (result.status) {
    case "NOT_CONNECTED":
      return fit(`Gotcha — connect your Sui wallet first and I'll take it from there: ${terminalLink()}`);
    case "NOT_IMPLEMENTED":
      return fit(`${result.message} Follow along here: ${terminalLink()}`);
    case "FAILED":
      return fit(`Hmm, I couldn't read that one. Try: "${X_BOT_HANDLE} launch $DOG Sui Dog paired with USDC"`);
    default:
      return fit(`${result.message} ${terminalLink()}`);
  }
}
