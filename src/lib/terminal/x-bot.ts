import type { TerminalToolResult } from "./types";

/** The X account that receives launch calls, e.g. "@ourblastbot launch $DOG Sui Dog". */
export const X_BOT_HANDLE = "@ourblastbot";
export const X_BOT_SITE = "https://ourblast.xyz";

/**
 * Posting replies needs X app credentials for @ourblastbot. Until those are saved the
 * pipeline runs in dry-run: replies are composed and stored, never posted.
 */
export const X_BOT_DRY_RUN = true;

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
}

const terminalLink = (params?: Record<string, string>) => {
  const url = new URL("/terminal", X_BOT_SITE);
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
  return url.toString();
};

/** Never claims an on-chain launch happened — Blast.fun deployment is not wired up yet. */
export function composeXReply(result: TerminalToolResult): string {
  const launch = result.launch;
  if (launch) {
    const link = terminalLink({ symbol: launch.symbol, name: launch.name });
    return `Okayyyy blasting a new token: $${launch.symbol} ${launch.name} 🚀 Sign it with your Sui wallet here, buy link drops right after: ${link}`;
  }

  switch (result.status) {
    case "NOT_CONNECTED":
      return `Gotcha — connect your Sui wallet first and I'll take it from there: ${terminalLink()}`;
    case "NOT_IMPLEMENTED":
      return `${result.message} Follow along here: ${terminalLink()}`;
    case "FAILED":
      return `Hmm, I couldn't read that one. Try: "${X_BOT_HANDLE} launch $DOG Sui Dog"`;
    default:
      return `${result.message} ${terminalLink()}`;
  }
}
