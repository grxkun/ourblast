import { normalizeCommandText } from "./commandParser";
import { normalizeSymbol } from "./ticker";
import { LAUNCHPAD, matchLaunchpad, resolveLaunchpad, type LaunchpadConfig } from "./launchpad";

/**
 * The simple X launcher: one tweet ("Deploy $TETY Tety Yety Caty on Suipump")
 * becomes one launch request that a human confirms in the OurBlast Terminal.
 * Nothing here talks to a chain — see xLauncher.server.ts for that.
 */

export const LAUNCH_REQUEST_STATUSES = ["PENDING", "LAUNCHING", "DEPLOYED", "FAILED", "UNAVAILABLE"] as const;
export type LaunchRequestStatus = (typeof LAUNCH_REQUEST_STATUSES)[number];

export interface LauncherSettings {
  defaultLaunchpad: string;
  ourblastFeePercent: number;
  devBuyEnabled: boolean;
  autoLaunchEnabled: boolean;
}

import { extractPerps, type PerpsPositionRequest } from "./perpsParse";
export type { PerpsPositionRequest } from "./perpsParse";

export const DEFAULT_LAUNCHER_SETTINGS: LauncherSettings = {
  defaultLaunchpad: "suipump",
  ourblastFeePercent: 10,
  devBuyEnabled: false,
  autoLaunchEnabled: false,
};

/**
 * Who the caller wants the creator fees to go to, read from the tweet
 * ("Set @adiniyi as fee receiver", "fee receiver: 0x…"). Metadata only — naming
 * someone implies no endorsement by them.
 */
export interface FeeReceiverRequest {
  handle?: string | undefined;
  wallet?: string | undefined;
}

export interface DeployRequest {
  symbol: string;
  name: string;
  /** Launchpad id, already resolved against the supported list. */
  launchpad: string;
  /** Present for market-backed launches on Perpsplexity. */
  perps?: PerpsPositionRequest | undefined;
  /** Present when the tweet names a creator-fee receiver. */
  feeReceiver?: FeeReceiverRequest | undefined;
}

/** "Set @adiniyi as fee receiver", "fee receiver: @x", "creator fees to 0x…". */
const FEE_RECEIVER_PATTERNS: RegExp[] = [
  /\bset\s+(?:@([a-z0-9_]{1,15})|(0x[a-f0-9]{6,66}))\s+as\s+(?:the\s+|my\s+)?(?:creator\s+)?fee\s+(?:receiver|recipient|wallet|payout)\b/i,
  /\b(?:creator\s+)?fee\s+(?:receiver|recipient|wallet|payout)\s*(?:is\s+)?[:=]?\s*(?:@([a-z0-9_]{1,15})|(0x[a-f0-9]{6,66}))/i,
  /\b(?:creator\s+)?fees?\s+(?:go(?:es)?\s+)?to\s+(?:@([a-z0-9_]{1,15})|(0x[a-f0-9]{6,66}))/i,
];

/** Leftovers of the same phrases, removed so they never leak into the token name. */
const FEE_PHRASE_CLEANUP: RegExp[] = [
  /\bset\s+(?:@?[a-z0-9_]{1,20}\s+)?as\s+(?:the\s+|my\s+)?(?:creator\s+)?fee\s+(?:receiver|recipient|wallet|payout)\b/gi,
  /\b(?:creator\s+)?fee\s+(?:receiver|recipient|wallet|payout)\s*(?:is\s+)?[:=]?\s*(?:@?[a-z0-9_]{1,20}|0x[a-f0-9]{6,66})?/gi,
  /\b(?:creator\s+)?fees?\s+(?:go(?:es)?\s+)?to\s+(?:@?[a-z0-9_]{1,20}|0x[a-f0-9]{6,66})/gi,
];

/** Reads the fee receiver out of the raw tweet text (before mentions are stripped). */
export function extractFeeReceiver(rawText: string): FeeReceiverRequest | null {
  for (const pattern of FEE_RECEIVER_PATTERNS) {
    const match = rawText.match(pattern);
    if (!match) continue;
    if (match[1]) return { handle: match[1].toLowerCase() };
    if (match[2]) return { wallet: match[2].toLowerCase() };
  }
  return null;
}

function stripFeePhrases(text: string): string {
  let out = text;
  for (const pattern of FEE_PHRASE_CLEANUP) out = out.replace(pattern, " ");
  return out.replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
}

/**
 * Any word after "on" is a launchpad candidate — fuzzy matching in
 * matchLaunchpad tolerates typos ("on Peropelxity" → Perpsplexity) and
 * rejects non-pad words ("on Monday" → no pad).
 */
const PAD_ANYWHERE = /\bon\s+@?([a-z][a-z0-9.]{2,20})\b/gi;

/**
 * Scans every "on <word>" phrase, not just the first, so chatter like
 * "a bet on NVDA ... on Perpsplexity" still resolves the real pad.
 */
function findPadMatch(source: string): { candidate: string; index: number; length: number } | null {
  for (const match of source.matchAll(PAD_ANYWHERE)) {
    const candidate = (match[1] ?? "").replace(/\s+/g, "").replace(/^@/, "");
    if (candidate && matchLaunchpad(candidate)) {
      return { candidate, index: match.index ?? 0, length: match[0].length };
    }
  }
  return null;
}

/** "Deploy a $TETY", "deploy a ticker $TETY", "launch me a new meme coin $TETY", "create token called $TETY". */
const DEPLOY_CALL =
  /\b(?:deploy|launch|create|mint|make)\s+(?:me\s+|us\s+)?(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:(?:meme\s+)?(?:coin|token|ticker)\s+)?(?:called\s+|named\s+)?\$([a-z0-9]{2,10})\b([\s\S]*)/i;

/** "nsme: Tety Yety" / "name Tety Yety" / "name token: Tety" / "called Tety Yety" — chatty ways to give the name. */
const NAME_MARKER = /^[\s,:;.\-–—]*(?:n[ase]?me|named|called|title)(?:\s+(?:token|coin|ticker))?\s*[:=]?\s*/i;

/** A deploy verb anywhere in the tweet (field-style calls put the cashtag on another line). */
const DEPLOY_VERB = /\b(?:deploy|launch|create|mint|make)\b/i;

/** "Name: THINKING CAT" / "name = Sui Dog" — value runs until the next field label. */
const FIELD_NAME =
  /\b(?:n[ase]?me|title)\s*[:=]\s*([^$]+?)(?=\s+\b(?:ticker|symbol|sym|image|img|picture|pic|supply|desc|description|underlying|market|asset|position|direction|side|leverage|lev|mc)\b|\s*$)/i;

/** "named Baldeniyi ticker $BALDENIYI" — a colon-free name, ended by the next label or comma. */
const FIELD_NAME_LOOSE =
  /\b(?:named|called)\s+([a-z0-9][^$,\n]*?)(?=\s+\b(?:ticker|symbol|sym|image|img|picture|pic|supply|desc|description|underlying|market|asset|position|direction|side|leverage|lev|mc|fee|fees)\b|[,\n]|\s*$)/i;

/** "Underlying: NVDA" / "market = TSLA" — shared with the terminal parser. */

/**
 * Reads a launch call out of a tweet, wherever it sits in the text:
 * "Deploy $TETY Tety Yety Caty on Suipump", "@bot hey... Deploy a $TETY nsme:
 * Tety Yety Caty on Suipump". Anything without a cashtag returns null.
 */
export function parseDeployTweet(rawText: string, defaultPad = LAUNCHPAD.id): DeployRequest | null {
  // Read the launchpad wherever it appears — on the raw text first, because
  // mention stripping would eat "@perpsplexity" before we could see it.
  const rawPadMatch = findPadMatch(rawText);
  // Same reason: "@adiniyi" must be read before mention stripping removes it.
  const feeReceiver = extractFeeReceiver(rawText) ?? undefined;
  let text = stripFeePhrases(normalizeCommandText(rawText));

  const textPadMatch = findPadMatch(text);
  const padMatch = textPadMatch ?? rawPadMatch;
  let requestedPad: string | null = null;
  if (padMatch) {
    requestedPad = padMatch.candidate;
    if (textPadMatch) {
      text = (text.slice(0, textPadMatch.index) + " " + text.slice(textPadMatch.index + textPadMatch.length)).trim();
    }
  }

  const pad = resolveLaunchpad(requestedPad ?? defaultPad);
  const isPerpsPad = pad.id === "perpsplexity";
  const perpsExtraction = extractPerps(text, isPerpsPad);
  text = perpsExtraction.text;
  const perps = perpsExtraction.perps ?? undefined;

  const match = text.match(DEPLOY_CALL);
  if (match?.[1]) {
    const symbol = match[1].toUpperCase();
    const rawName = (match[2] ?? "")
      .replace(NAME_MARKER, "")
      .replace(/\s+/g, " ")
      .replace(/[\s.,!?;:-]+$/g, "")
      .trim();
    const name = rawName.length >= 2 ? rawName.slice(0, 64) : symbol;
    return { symbol, name, launchpad: pad.id, perps, feeReceiver };
  }

  // Field-style tweets: "deploy a token on suipump / Name: THINKING CAT / ticker: $HMMM".
  if (!DEPLOY_VERB.test(text)) return null;
  // Prefer the cashtag next to a "ticker"/"symbol" label — greetings like "Gm $SUI"
  // put another cashtag earlier in the tweet.
  // The value may carry stray prefixes people type ("Ticker : u/PURPLE"):
  // normalizeSymbol keeps the meaningful part.
  const labelled = text.match(/\b(?:ticker|symbol|sym)\s*(?:is\s+)?[:=]?\s*\$?((?:[a-z0-9]+[/\\_.-]){0,2}[a-z0-9]{2,10})\b/i);
  const cashtag = labelled ?? text.match(/\$([a-z0-9]{2,10})\b/i);
  const nameMatch = text.match(FIELD_NAME) ?? text.match(FIELD_NAME_LOOSE);
  const nameRaw = nameMatch?.[1]?.trim().replace(/[\s,;:.\-–—]+$/g, "") ?? "";
  if (!cashtag?.[1]) {
    // No ticker anywhere: derive one from an explicit "Name: …" so field-style
    // tweets without a cashtag still launch ("Name: Monerochan" → $MONEROCHAN).
    const derived = nameRaw.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10);
    if (derived.length < 2) return null;
    return { symbol: derived, name: nameRaw.slice(0, 64), launchpad: pad.id, perps, feeReceiver };
  }
  const symbol = normalizeSymbol(cashtag[1]);
  if (!symbol) return null;
  const name = nameRaw.length >= 2 ? nameRaw.slice(0, 64) : symbol;
  return { symbol, name, launchpad: pad.id, perps, feeReceiver };
}

export function padFor(settings: LauncherSettings, requested?: string | null): LaunchpadConfig {
  return resolveLaunchpad(requested ?? settings.defaultLaunchpad);
}

/**
 * A direct picture link written in the tweet text. Shortened t.co links are
 * skipped: they resolve to the tweet page, not to an image file.
 */
export function imageUrlInText(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp)(?:\?[^\s"'<>]*)?/i);
  return match?.[0] ?? null;
}
