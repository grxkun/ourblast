import { normalizeCommandText } from "./commandParser";
import { normalizeSymbol } from "./ticker";
import { fixTypos } from "./typos";
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
  /** A SuiNS name ("doni.sui"), resolved to its address when the launch is recorded. */
  suins?: string | undefined;
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
  /** "first buy 25" — the launcher's own opening buy, in USDC (Perpsplexity). */
  devBuyUsdc?: number | undefined;
  /** "dev buy 25 SUI" — the launcher's own opening buy, in SUI (POPULAR, RIPT). */
  devBuySui?: number | undefined;
}

/** "dev buy 25", "first buy $50", "initial buy: 10" — an opening buy in USDC. */
const DEV_BUY_PHRASE =
  /\b(?:dev|devs|developer|first|initial|opening|my)\s+buy\s*(?:of\s+|for\s+)?[:=]?\s*\$?(\d{1,6}(?:\.\d{1,6})?)\s*(?:usdc|usd|sui|\$)?/i;

/** The opening buy a tweet asks for, in USDC, or null. */
export function extractDevBuy(text: string): number | null {
  const raw = fixTypos(text).match(DEV_BUY_PHRASE)?.[1];
  const amount = raw ? Number(raw) : NaN;
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function stripDevBuyPhrase(text: string): string {
  return text.replace(new RegExp(DEV_BUY_PHRASE.source, "gi"), " ").replace(/\s{2,}/g, " ").trim();
}

/** "Set @adiniyi as fee receiver", "fee receiver: @x", "creator fees to 0x…". */
const FEE_RECEIVER_PATTERNS: RegExp[] = [
  /\bset\s+(?:@([a-z0-9_]{1,15})|(0x[a-f0-9]{6,66})|([a-z0-9][a-z0-9-]{0,62}\.sui)\b)\s+as\s+(?:the\s+|my\s+)?(?:creator\s+)?fees?\s+(?:receiver|recipient|wallet|payout)\b/i,
  /\b(?:creator\s+)?fees?\s+(?:receiver|recipient|wallet|payout)\s*(?:is\s+|to\s+)?[:=]?\s*(?:@([a-z0-9_]{1,15})|(0x[a-f0-9]{6,66})|([a-z0-9][a-z0-9-]{0,62}\.sui)\b)/i,
  /\b(?:creator\s+)?fees?\s+(?:go(?:es)?\s+|goes\s+)?(?:payout\s+)?(?:to|for|->|=>)\s*(?:@([a-z0-9_]{1,15})|(0x[a-f0-9]{6,66})|([a-z0-9][a-z0-9-]{0,62}\.sui)\b)/i,
  /\b(?:send|route|redirect|give|pay)\s+(?:all\s+)?(?:the\s+|my\s+)?(?:creator\s+)?fees?\s+to\s+(?:@([a-z0-9_]{1,15})|(0x[a-f0-9]{6,66})|([a-z0-9][a-z0-9-]{0,62}\.sui)\b)/i,
];

/** Leftovers of the same phrases, removed so they never leak into the token name. */
const FEE_PHRASE_CLEANUP: RegExp[] = [
  /\b(?:set|send|route|redirect|give|pay)\s+(?:all\s+)?(?:the\s+|my\s+)?(?:creator\s+)?fees?\s+(?:receiver\s+|recipient\s+)?(?:to|as)\s+(?:0x[a-f0-9]{6,66}|[a-z0-9][a-z0-9-]{0,62}\.sui\b|@?[a-z0-9_]{1,20})/gi,
  /\bset\s+(?:(?:0x[a-f0-9]{6,66}|[a-z0-9][a-z0-9-]{0,62}\.sui\b|@?[a-z0-9_]{1,20})\s+)?as\s+(?:the\s+|my\s+)?(?:creator\s+)?fees?\s+(?:receiver|recipient|wallet|payout)\b/gi,
  /\b(?:creator\s+)?fees?\s+(?:receiver|recipient|wallet|payout)\s*(?:is\s+|to\s+)?[:=]?\s*(?:0x[a-f0-9]{6,66}|[a-z0-9][a-z0-9-]{0,62}\.sui\b|@?[a-z0-9_]{1,20})?/gi,
  /\b(?:creator\s+)?fees?\s+(?:go(?:es)?\s+)?(?:payout\s+)?(?:to|for|->|=>)\s*(?:0x[a-f0-9]{6,66}|[a-z0-9][a-z0-9-]{0,62}\.sui\b|@?[a-z0-9_]{1,20})/gi,
];

/** Reads the fee receiver out of the raw tweet text (before mentions are stripped). */
export function extractFeeReceiver(rawText: string): FeeReceiverRequest | null {
  for (const pattern of FEE_RECEIVER_PATTERNS) {
    const match = rawText.match(pattern);
    if (!match) continue;
    if (match[1]) return { handle: match[1].toLowerCase() };
    if (match[2]) return { wallet: match[2].toLowerCase() };
    if (match[3]) return { suins: match[3].toLowerCase() };
  }
  return null;
}

function stripFeePhrases(text: string): string {
  let out = text;
  for (const pattern of FEE_PHRASE_CLEANUP) out = out.replace(pattern, " ");
  return out.replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
}

/** "paired with USDC", "pair $BLAST", "vs DEEP", "quote: WAL", "/USDC pair". */
const PAIR_PHRASE =
  /\b(?:paired\s+(?:with|against|to)|pair(?:ed)?(?:\s+(?:with|against|to|token))?|quote(?:\s+token)?|vs\.?|against)\s*[:=]?\s*\$?([a-z]{2,10})\b/i;

/** The quote token a tweet asks for (uppercased), or null. Validation happens per pad. */
export function extractPairToken(text: string): string | null {
  return fixTypos(text).match(PAIR_PHRASE)?.[1]?.toUpperCase() ?? null;
}

function stripPairPhrase(text: string): string {
  return text.replace(new RegExp(PAIR_PHRASE.source, "gi"), " ").replace(/\s{2,}/g, " ").trim();
}

/**
 * Any word after "on" is a launchpad candidate — fuzzy matching in
 * matchLaunchpad tolerates typos ("on Peropelxity" → Perpsplexity) and
 * rejects non-pad words ("on Monday" → no pad).
 */
const PAD_ANYWHERE = /\b(?:on|in|at|via|using)\s+@?([a-z][a-z0-9.]{2,20})\b/gi;

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
  /\b(?:named|called|name(?:\s+is)?)\s+([a-z0-9][^$,\n]*?)(?=\s+\b(?:ticker|symbol|sym|image|img|picture|pic|supply|desc|description|underlying|market|asset|position|direction|side|leverage|lev|mc|fee|fees)\b|[,\n]|\s*$)/i;

/** "Underlying: NVDA" / "market = TSLA" — shared with the terminal parser. */

/**
 * Reads a launch call out of a tweet, wherever it sits in the text:
 * "Deploy $TETY Tety Yety Caty on Suipump", "@bot hey... Deploy a $TETY nsme:
 * Tety Yety Caty on Suipump". Anything without a cashtag returns null.
 */
export function parseDeployTweet(tweetText: string, defaultPad = LAUNCHPAD.id): DeployRequest | null {
  const rawText = fixTypos(tweetText);
  // Read the launchpad wherever it appears — on the raw text first, because
  // mention stripping would eat "@perpsplexity" before we could see it.
  const rawPadMatch = findPadMatch(rawText);
  // Same reason: "@adiniyi" must be read before mention stripping removes it.
  const feeReceiver = extractFeeReceiver(rawText) ?? undefined;
  const devBuyAmount = extractDevBuy(rawText) ?? undefined;
  let text = stripDevBuyPhrase(stripPairPhrase(stripFeePhrases(normalizeCommandText(rawText))));

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
  // The dev-buy number is currency-denominated by pad: USDC on Perpsplexity,
  // SUI on the SUI-quoted pads (POPULAR, RIPT).
  const devBuyUsdc = isPerpsPad ? devBuyAmount : undefined;
  const devBuySui = pad.id === "popular" || pad.id === "ript" ? devBuyAmount : undefined;
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
    return { symbol, name, launchpad: pad.id, perps, feeReceiver, devBuyUsdc, devBuySui };
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
    return { symbol: derived, name: nameRaw.slice(0, 64), launchpad: pad.id, perps, feeReceiver, devBuyUsdc, devBuySui };
  }
  const symbol = normalizeSymbol(cashtag[1]);
  if (!symbol) return null;
  const name = nameRaw.length >= 2 ? nameRaw.slice(0, 64) : symbol;
  return { symbol, name, launchpad: pad.id, perps, feeReceiver, devBuyUsdc, devBuySui };
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

/**
 * "Desc : Your AI Trading Assistant…" / "Description = …" — the token's own
 * description as the caller wrote it. Runs until the next field label or the end.
 */
export function extractDescription(rawText: string): string | null {
  const match = rawText.match(
    /\b(?:desc|description|about|bio)\s*[:=]\s*([\s\S]+?)(?=\n\s*(?:name|title|ticker|symbol|sym|image|img|pic|picture|supply|website|web|site|twitter|telegram|tg|x|fee|fees)\s*[:=]|$)/i,
  );
  const value = match?.[1]
    ?.replace(/@[a-z0-9_]{1,15}/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return value && value.length >= 2 ? value : null;
}

export interface TokenSocials {
  website: string | null;
  telegram: string | null;
  x: string | null;
}

const clean = (v?: string | null) => v?.replace(/[)\].,;!]+$/, "").trim() || null;

/**
 * "Website: foo.xyz" / "TG: t.me/foo" / "X: @foo" / "twitter: x.com/foo" —
 * the project's own links, used for the token's metadata on the launchpad.
 * t.co links are kept: they are the only form X gives us for a pasted link.
 */
export function extractSocials(tweetText: string): TokenSocials {
  const text = fixTypos(tweetText);
  const field = (labels: string) =>
    text.match(new RegExp(`\\b(?:${labels})\\s*[:=-]\\s*(\\S+)`, "i"))?.[1] ?? null;
  let website = clean(field("website|web|site|www|url|homepage"));
  let telegram = clean(field("telegram|tg|tele"));
  let x = clean(field("twitter|x|tw"));
  // Bare links anywhere in the tweet.
  telegram ??= clean(text.match(/\b(?:https?:\/\/)?t\.me\/[a-z0-9_+/]+/i)?.[0]);
  x ??= clean(text.match(/\bhttps?:\/\/(?:www\.)?(?:x|twitter)\.com\/(?!i\/|ourblastbot)[a-z0-9_]{1,15}\b/i)?.[0]);
  const withScheme = (v: string | null) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v);
  if (x?.startsWith("@")) x = `https://x.com/${x.slice(1)}`;
  if (website && !/[.]/.test(website)) website = null;
  if (telegram && !/[./]/.test(telegram)) telegram = `https://t.me/${telegram.replace(/^@/, "")}`;
  return { website: withScheme(website), telegram: withScheme(telegram), x: withScheme(x) };
}

/** "Image: https://…" — an explicit picture link, even without a file extension. */
export function imageFieldInText(text: string): string | null {
  return clean(fixTypos(text).match(/\b(?:image|img|pic|picture|logo|icon)\s*[:=-]\s*(https?:\/\/\S+)/i)?.[1]);
}

/** OURBLAST artwork used when a launch call brings no picture of its own. */
export const DEFAULT_TOKEN_ICON_URL = "https://ourblast.xyz/icon-192.png";

/**
 * The picture that goes into the coin's on-chain metadata. A launch without any
 * artwork would otherwise publish an empty icon, which explorers show as blank.
 */
export function tokenIconUrl(icon?: string | null): string {
  return icon?.trim() || DEFAULT_TOKEN_ICON_URL;
}

