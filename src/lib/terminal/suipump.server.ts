// SPDX-License-Identifier: BUSL-1.1
/**
 * Read-only client for the public Suipump data API (documented at
 * https://suipump.org/integrations). Suipump has no launch endpoint, so this
 * file never creates anything: it only reads curves so OurBlast can confirm a
 * token really exists on chain before it ever says "deployed".
 */

const BASE = "https://suipump-main-web.onrender.com";
export const SUIPUMP_SITE = "https://suipump.org";

export interface SuipumpToken {
  curveId: string;
  creator: string;
  name: string;
  symbol: string;
  iconUrl: string | null;
  tokenType: string;
  /** Milliseconds as a string in the feed. */
  createdAt: string;
  graduated: boolean;
  poolId: string | null;
}

interface RawToken extends SuipumpToken {
  stats?: Record<string, unknown> | null;
}

/** The list route is edge-cached for 10s; never poll it faster than that. */
let cache: { at: number; rows: RawToken[] } | null = null;

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Suipump read failed (${response.status})`);
  return (await response.json()) as T;
}

export async function listSuipumpTokens(): Promise<RawToken[]> {
  if (cache && Date.now() - cache.at < 10_000) return cache.rows;
  const rows = await fetchJson<RawToken[]>("/tokens");
  cache = { at: Date.now(), rows: Array.isArray(rows) ? rows : [] };
  return cache.rows;
}

function cleanDescription(value: unknown): string {
  return typeof value === "string" ? (value.split("||")[0] ?? "").trim().slice(0, 200) : "";
}

export interface SuipumpSummary {
  curveId: string;
  name: string;
  symbol: string;
  description: string;
  iconUrl: string | null;
  tokenPage: string;
  graduated: boolean;
  /** "pending" while a graduated curve waits for its DEX pool to be recorded. */
  poolState: "curve" | "pending" | "live";
  priceSui: number | null;
  volumeSui: number | null;
  trades: number | null;
  /** 0–1 progress towards graduation; null when the numbers are not published. */
  progress: number | null;
}

function toNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function summarizeSuipumpToken(row: RawToken): SuipumpSummary {
  const stats = (row.stats ?? {}) as Record<string, unknown>;
  const reserve = toNumber(stats["reserve_sui"]);
  const threshold = toNumber(stats["grad_threshold_sui"]);
  const progress = row.graduated
    ? 1
    : reserve !== null && threshold !== null && threshold > 0
      ? Math.min(1, reserve / threshold)
      : null;

  return {
    curveId: row.curveId,
    name: row.name,
    symbol: row.symbol,
    description: cleanDescription((row as unknown as { description?: unknown }).description),
    iconUrl: row.iconUrl ?? null,
    tokenPage: `${SUIPUMP_SITE}/token/${row.curveId}`,
    graduated: Boolean(row.graduated),
    // graduated flips before the pool id is written — say "pending", never show a broken link.
    poolState: !row.graduated ? "curve" : row.poolId ? "live" : "pending",
    priceSui: toNumber(stats["live_price_sui"]) ?? toNumber(stats["last_price"]),
    volumeSui: toNumber(stats["volume_sui"]),
    trades: toNumber(stats["trades"]),
    progress,
  };
}

/** Looks a token up by curve id, coin type or symbol. Newest match wins. */
export async function findSuipumpToken(query: string): Promise<SuipumpSummary | null> {
  const needle = query.trim().replace(/^\$/, "").toLowerCase();
  if (!needle) return null;
  const rows = await listSuipumpTokens();
  const matches = rows.filter(
    (row) =>
      row.curveId.toLowerCase() === needle ||
      row.tokenType.toLowerCase() === needle ||
      row.symbol.toLowerCase() === needle,
  );
  if (!matches.length) return null;
  matches.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
  return summarizeSuipumpToken(matches[0] as RawToken);
}

/**
 * Finds the curve for a launch that a human created by hand on suipump.org:
 * same ticker, created after the request came in.
 */
export async function findSuipumpLaunch(
  symbol: string,
  createdAfterMs: number,
): Promise<SuipumpSummary | null> {
  const needle = symbol.trim().replace(/^\$/, "").toLowerCase();
  const rows = await listSuipumpTokens();
  const matches = rows
    .filter((row) => row.symbol.toLowerCase() === needle && Number(row.createdAt) >= createdAfterMs)
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
  const row = matches[0];
  return row ? summarizeSuipumpToken(row) : null;
}

/** On-chain supply read (expensive route — 60s or slower). */
export async function readSuipumpSupply(curveId: string): Promise<{
  totalSupplyFormatted: string | null;
  graduated: boolean;
} | null> {
  try {
    const data = await fetchJson<{ totalSupplyFormatted?: string; graduated?: boolean }>(
      `/curve/${curveId}/supply`,
    );
    return { totalSupplyFormatted: data.totalSupplyFormatted ?? null, graduated: Boolean(data.graduated) };
  } catch {
    return null;
  }
}
