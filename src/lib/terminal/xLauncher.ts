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

const PAD_WORD = "[a-z0-9.\\s]{3,20}";

/**
 * "Deploy $TETY Tety Yety Caty on Suipump" / "Deploy $TETY on Suipump" /
 * "Deploy $TETY Tety Yety Caty". Anything else returns null.
 */
export function parseDeployTweet(rawText: string, defaultPad = LAUNCHPAD.id): DeployRequest | null {
  const text = normalizeCommandText(rawText);
  const match = text.match(
    new RegExp(`^(?:deploy|launch|create)\\s+\\$?([a-z0-9]{2,10})\\b([^]*?)?(?:\\s+on\\s+(${PAD_WORD}))?$`, "i"),
  );
  if (!match?.[1]) return null;

  const symbol = match[1].toUpperCase();
  const requestedPad = match[3]?.trim() ?? null;
  const pad = requestedPad ? resolveLaunchpad(requestedPad) : resolveLaunchpad(defaultPad);
  const rawName = (match[2] ?? "").replace(/\s+/g, " ").replace(/[\s.,!?;:-]+$/g, "").trim();
  const name = rawName.length >= 2 ? rawName.slice(0, 64) : symbol;
  return { symbol, name, launchpad: pad.id };
}

export function padFor(settings: LauncherSettings, requested?: string | null): LaunchpadConfig {
  return resolveLaunchpad(requested ?? settings.defaultLaunchpad);
}
