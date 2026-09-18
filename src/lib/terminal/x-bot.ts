import { LAUNCHPAD } from "./launchpad";
import type { TerminalToolResult } from "./types";

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

/** Never claims an on-chain launch happened — launchpad deployment is not wired up yet. */
export function composeXReply(result: TerminalToolResult): string {
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
    });
    const pad = launch.launchpad || LAUNCHPAD.label;
    const pair = launch.pairToken && launch.pairToken !== "SUI" ? ` paired with $${launch.pairToken}` : "";
    const lp = ` LP ${launch.liquidity} $${launch.pairToken}.`;
    const rawNotes = Array.isArray(result.data?.["notes"]) ? (result.data["notes"] as string[]) : [];
    const note = rawNotes[0] ? ` ${rawNotes[0]}` : "";
    const head = `Okayyyy blasting a new token on ${pad}${pair}: $${launch.symbol} ${launch.name} 🚀${lp} 0 launch fee.`;
    const tail = ` Sign it with your Sui wallet here, buy link drops right after: ${link}`;
    // The link must survive; the explanatory note is the first thing dropped.
    return fit(head.length + note.length + tail.length <= 280 ? head + note + tail : head + tail);
  }

  switch (result.status) {
    case "NOT_CONNECTED":
      return fit(`Gotcha — connect your Sui wallet first and I'll take it from there: ${terminalLink()}`);
    case "NOT_IMPLEMENTED":
      return fit(`${result.message} Follow along here: ${terminalLink()}`);
    case "FAILED":
      return fit(`Hmm, I couldn't read that one. Try: "${X_BOT_HANDLE} launch $DOG Sui Dog paired with $USDC"`);
    default:
      return fit(`${result.message} ${terminalLink()}`);
  }
}
