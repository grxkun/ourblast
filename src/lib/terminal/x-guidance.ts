// SPDX-License-Identifier: BUSL-1.1
/**
 * Near-miss guidance for X mentions the rule parser could not read.
 *
 * The bot used to answer every unreadable mention with one canned line (spam),
 * and then went fully silent (looked dead). This module sits in between: when a
 * mention clearly *tries* to use the bot, reply with the exact one-line syntax
 * for what they were reaching for. Anything else stays null → silence.
 *
 * Pure and deterministic: no network, no model, fully testable.
 */

import { X_BOT_HANDLE, enforceSingleCashtag } from "./x-bot";

const TERMINAL = "https://ourblast.xyz/terminal";

/** X hard-limits a post to 280 characters. */
const fit = (text: string) => (text.length <= 280 ? text : `${text.slice(0, 277).trimEnd()}…`);

export type GuidanceTopic = "launch" | "perps" | "claim" | "send" | "trade" | "help";

const TEMPLATES: Record<GuidanceTopic, string> = {
  launch: `Almost! Give me the full line and I'll blast it: "${X_BOT_HANDLE} launch $TICKER Token Name on suipump, description: your pitch" + attach the token picture. Pads: suipump, blastfun, maelstrom, perpsplexity. ${TERMINAL}`,
  perps: `For a leveraged one, copy this: "${X_BOT_HANDLE} launch on Perpsplexity, $TICKER, Token Name, SAMSUNG, Long 3x, Dev buy 5 USDC, description: your pitch" + attach a picture. Dev buy is USDC from your OurBank wallet. ${TERMINAL}`,
  claim: `To cash out creator fees just say: "${X_BOT_HANDLE} claim my fees on $TICKER". Fees always pay the recipient locked in at launch. Check first with "${X_BOT_HANDLE} check fees on TICKER". ${TERMINAL}`,
  send: `Sending works like this: "${X_BOT_HANDLE} send 5 SUI to @handle" or to a 0x address. Fund your OurBank wallet first: ${TERMINAL}`,
  trade: `Trading lines I read: "${X_BOT_HANDLE} buy me TOKEN_ADDRESS with 1 SUI", "sell 50% TOKEN_ADDRESS", "buy and burn 1 SUI of TOKEN_ADDRESS". ${TERMINAL}`,
  help: `Here's what I do: launch tokens ("launch $TICKER Token Name on suipump"), leveraged launches on Perpsplexity, buy/sell/burn, send SUI, and claim creator fees. Full list: ${TERMINAL}`,
};

const has = (text: string, pattern: RegExp) => pattern.test(text);

/** Which OurBlast action the mention was reaching for, if any. */
export function guidanceTopic(text: string): GuidanceTopic | null {
  const t = text.toLowerCase();

  if (has(t, /\b(perps?|perpsplexity|leverage[d]?|\d+\s*x\s*(long|short)|(long|short)\s*\d+\s*x)\b/)) return "perps";
  if (has(t, /\b(launch|deploy|mint|create)\b/) || has(t, /\bnew (coin|token)\b/)) return "launch";
  if (has(t, /\b(fee|fees|royalt(y|ies))\b/) || has(t, /\bclaim\b/)) return "claim";
  if (has(t, /\b(send|transfer|tip|withdraw)\b/)) return "send";
  if (has(t, /\b(buy|sell|burn|swap|trade)\b/)) return "trade";
  if (has(t, /\b(help|how|what can you|commands?|guide|syntax|instructions?)\b/) || t.includes("?")) return "help";

  return null;
}

/**
 * A guidance tweet for a mention that tried to command the bot, or null for
 * casual tags and spam (which must stay silent).
 */
/** For a "send …" attempt, name exactly which piece is missing. */
function missingSendPiece(text: string): string | null {
  const t = text.replace(/@ourblastbot\b/gi, " ");
  const m = /\b(?:send|transfer|tip|pay|give)\b(.*)$/i.exec(t);
  if (!m) return null;
  const rest = m[1] ?? "";
  if (!/\b\d+(?:\.\d+)?\b/.test(rest)) return "I couldn't find an amount (use digits, e.g. 5 or 10000).";
  if (!/\bto\b/i.test(rest)) return `I couldn't find who to send to. Add "to @handle", "to name.sui" or "to 0x…".`;
  const target = /\bto\s+(\S+)/i.exec(rest)?.[1] ?? "";
  if (!/^(?:@\w{1,15}|0x[0-9a-f]{64}|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.sui)$/i.test(target.replace(/[.,!?;:)]+$/, "")))
    return `"${target.slice(0, 30)}" isn't a valid destination. Use @handle, name.sui or a full 0x address.`;
  return "I couldn't read the token. Use a symbol like SUI or the full 0x…::coin::COIN type.";
}

export function nearMissGuidance(text: string): string | null {
  const clean = text.trim();
  if (clean.length < 3) return null;
  const topic = guidanceTopic(clean);
  if (!topic) return null;
  if (topic === "send") {
    const piece = missingSendPiece(clean);
    if (piece) return fit(enforceSingleCashtag(`Almost! ${piece} Format: "${X_BOT_HANDLE} send 5 SUI to @handle". ${TERMINAL}`));
  }
  return fit(enforceSingleCashtag(TEMPLATES[topic]));
}
