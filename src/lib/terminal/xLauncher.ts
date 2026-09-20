import { normalizeCommandText } from "./commandParser";
import { LAUNCHPAD, resolveLaunchpad, type LaunchpadConfig } from "./launchpad";

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

export const DEFAULT_LAUNCHER_SETTINGS: LauncherSettings = {
  defaultLaunchpad: "suipump",
  ourblastFeePercent: 10,
  devBuyEnabled: false,
  autoLaunchEnabled: false,
};

export interface DeployRequest {
  symbol: string;
  name: string;
  /** Launchpad id, already resolved against the supported list. */
  launchpad: string;
}

/** Only the launchpads we actually support may be named in a deploy command. */
const PAD_ANYWHERE =
  /\bon\s+(suipump(?:\.org)?|sui\s*pump|pump|maelstrom|strom|mael|ript(?:\.fun)?|blast(?:\.fun)?|blastfun|vice(?:\.fun)?|vicefun)\b/i;

/** "Deploy a $TETY", "deploy a ticker $TETY", "launch me a new meme coin $TETY", "create token called $TETY". */
const DEPLOY_CALL =
  /\b(?:deploy|launch|create|mint|make)\s+(?:me\s+|us\s+)?(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:(?:meme\s+)?(?:coin|token|ticker)\s+)?(?:called\s+|named\s+)?\$([a-z0-9]{2,10})\b([\s\S]*)/i;

/** "nsme: Tety Yety" / "name Tety Yety" / "name token: Tety" / "called Tety Yety" — chatty ways to give the name. */
const NAME_MARKER = /^[\s,:;.\-–—]*(?:n[ase]?me|named|called|title)(?:\s+(?:token|coin|ticker))?\s*[:=]?\s*/i;

/** A deploy verb anywhere in the tweet (field-style calls put the cashtag on another line). */
const DEPLOY_VERB = /\b(?:deploy|launch|create|mint|make)\b/i;

/** "Name: THINKING CAT" / "name = Sui Dog" — value runs until the next field label. */
const FIELD_NAME =
  /\b(?:n[ase]?me|title)\s*[:=]\s*([^$]+?)(?=\s+\b(?:ticker|symbol|sym|image|img|picture|pic|supply|desc|description)\b|\s*$)/i;

/**
 * Reads a launch call out of a tweet, wherever it sits in the text:
 * "Deploy $TETY Tety Yety Caty on Suipump", "@bot hey... Deploy a $TETY nsme:
 * Tety Yety Caty on Suipump". Anything without a cashtag returns null.
 */
export function parseDeployTweet(rawText: string, defaultPad = LAUNCHPAD.id): DeployRequest | null {
  let text = normalizeCommandText(rawText);

  // Read the launchpad wherever it appears, then remove it so it never lands in the name.
  const padMatch = text.match(PAD_ANYWHERE);
  let requestedPad: string | null = null;
  if (padMatch?.[1]) {
    requestedPad = padMatch[1].replace(/\s+/g, "");
    text = (text.slice(0, padMatch.index) + " " + text.slice((padMatch.index ?? 0) + padMatch[0].length)).trim();
  }

  const match = text.match(DEPLOY_CALL);
  if (match?.[1]) {
    const symbol = match[1].toUpperCase();
    const pad = resolveLaunchpad(requestedPad ?? defaultPad);
    const rawName = (match[2] ?? "")
      .replace(NAME_MARKER, "")
      .replace(/\s+/g, " ")
      .replace(/[\s.,!?;:-]+$/g, "")
      .trim();
    const name = rawName.length >= 2 ? rawName.slice(0, 64) : symbol;
    return { symbol, name, launchpad: pad.id };
  }

  // Field-style tweets: "deploy a token on suipump / Name: THINKING CAT / ticker: $HMMM".
  if (!DEPLOY_VERB.test(text)) return null;
  const cashtag = text.match(/\$([a-z0-9]{2,10})\b/i);
  if (!cashtag?.[1]) return null;
  const symbol = cashtag[1].toUpperCase();
  const pad = resolveLaunchpad(requestedPad ?? defaultPad);
  const nameMatch = text.match(FIELD_NAME);
  const name = nameMatch?.[1]?.trim() && nameMatch[1].trim().length >= 2 ? nameMatch[1].trim().slice(0, 64) : symbol;
  return { symbol, name, launchpad: pad.id };
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
