import { resolveLaunchpad, resolvePairToken, type LaunchpadConfig } from "./launchpad";
import { describeFeePayout, normalizeFeePayout } from "./feePayout";
import type { LaunchConfiguration } from "./types";

export interface LaunchSettingsInput {
  pairToken?: string | null;
  liquidity?: number | null;
  devBuy?: number | null;
  totalSupply?: number | null;
}

export interface NormalizedLaunchSettings {
  pairToken: string;
  liquidity: number;
  devBuy: number;
  totalSupply: number;
  notes: string[];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

/**
 * Server-authoritative normalisation of every LP setting a user can request.
 * Values outside a pad's range are clamped and explained, never silently accepted.
 */
export function normalizeLaunchSettings(pad: LaunchpadConfig, input: LaunchSettingsInput): NormalizedLaunchSettings {
  const notes: string[] = [];

  const requestedPair = input.pairToken ? input.pairToken.replace(/^\$/, "").trim().toUpperCase() : null;
  const pairToken = resolvePairToken(pad, requestedPair);
  if (requestedPair && requestedPair !== pairToken) {
    notes.push(
      pad.supportsCustomPair
        ? `${pad.label} cannot pair against $${requestedPair} yet, so the LP is paired with $${pairToken}.`
        : `${pad.label} pairs every launch against $${pairToken}.`,
    );
  }

  const liquidityRequested = Number.isFinite(input.liquidity) ? Number(input.liquidity) : null;
  const liquidity = round(clamp(liquidityRequested ?? pad.liquidity.default, pad.liquidity.min, pad.liquidity.max));
  if (liquidityRequested !== null && liquidity !== round(liquidityRequested)) {
    notes.push(`${pad.label} liquidity must be between ${pad.liquidity.min} and ${pad.liquidity.max} $${pairToken}; set to ${liquidity}.`);
  }

  const devRequested = Number.isFinite(input.devBuy) ? Number(input.devBuy) : null;
  const devBuy = round(clamp(devRequested ?? 0, 0, pad.liquidity.max));
  if (devRequested !== null && devBuy !== round(devRequested)) {
    notes.push(`Dev buy adjusted to ${devBuy} $${pairToken}.`);
  }

  const supplyRequested = Number.isFinite(input.totalSupply) ? Number(input.totalSupply) : null;
  const totalSupply = Math.round(clamp(supplyRequested ?? pad.supply.default, pad.supply.min, pad.supply.max));
  if (supplyRequested !== null && totalSupply !== Math.round(supplyRequested)) {
    notes.push(`${pad.label} supply must be between ${pad.supply.min.toLocaleString()} and ${pad.supply.max.toLocaleString()}; set to ${totalSupply.toLocaleString()}.`);
  }

  return { pairToken, liquidity, devBuy, totalSupply, notes };
}

/** Re-normalises a whole draft after the user edits it in the launch card. */
export function normalizeLaunchConfig(config: LaunchConfiguration): { config: LaunchConfiguration; notes: string[] } {
  const pad = resolveLaunchpad(config.launchpad);
  const settings = normalizeLaunchSettings(pad, config);
  return {
    config: {
      ...config,
      launchpad: pad.label,
      pairToken: settings.pairToken,
      liquidity: settings.liquidity,
      devBuy: settings.devBuy,
      totalSupply: settings.totalSupply,
    },
    notes: settings.notes,
  };
}

export function describeLaunchSettings(config: LaunchConfiguration): string {
  const dev = config.devBuy > 0 ? `, dev buy ${config.devBuy} $${config.pairToken}` : "";
  return `LP ${config.liquidity} $${config.pairToken}${dev}, supply ${config.totalSupply.toLocaleString()}`;
}
