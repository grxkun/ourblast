// SPDX-License-Identifier: BUSL-1.1
// Blast.fun Partner API client. Server-only: the partner key never reaches the browser.
const BASE = "https://www.blast.fun/api/v1";
const TTL_MS = 30_000;

export type BlastPresale = {
  id: string;
  name: string | null;
  symbol: string | null;
  image: string | null;
  status: string | null;
  raised: string | null;
  target: string | null;
  endsAtMs: number | null;
  url: string;
};

export type BlastFeed = { ok: true; presales: BlastPresale[] } | { ok: false; reason: "no_key" | "unavailable"; presales: [] };

let cache: { at: number; value: BlastFeed } | null = null;
let inflight: Promise<BlastFeed> | null = null;

const str = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

function normalize(raw: Record<string, unknown>): BlastPresale | null {
  const id = str(raw.id ?? raw.presale_id ?? raw.presaleId);
  if (!id) return null;
  const token = (raw.token ?? {}) as Record<string, unknown>;
  return {
    id,
    name: str(raw.name ?? token.name),
    symbol: str(raw.symbol ?? raw.ticker ?? token.symbol),
    image: str(raw.image_url ?? raw.imageUrl ?? raw.image ?? token.image_url ?? token.icon_url),
    status: str(raw.status ?? raw.state),
    raised: str(raw.raised ?? raw.total_committed ?? raw.totalCommitted),
    target: str(raw.target ?? raw.soft_cap ?? raw.raise_target),
    endsAtMs: num(raw.end_ms ?? raw.endMs ?? raw.ends_at_ms ?? raw.endsAtMs),
    url: `https://blast.fun/presale/${encodeURIComponent(id)}`,
  };
}

async function load(key: string): Promise<BlastFeed> {
  try {
    const res = await fetch(`${BASE}/presales?limit=20`, { headers: { "X-Blast-Partner-Key": key } });
    if (!res.ok) {
      console.error("blast presales HTTP", res.status, res.headers.get("retry-after"));
      return { ok: false, reason: "unavailable", presales: [] };
    }
    const page = (await res.json()) as { presales?: unknown[] };
    const presales = (page.presales ?? [])
      .map((p) => (p && typeof p === "object" ? normalize(p as Record<string, unknown>) : null))
      .filter((p): p is BlastPresale => p !== null);
    return { ok: true, presales };
  } catch (e) {
    console.error("blast presales fetch failed", e);
    return { ok: false, reason: "unavailable", presales: [] };
  }
}

export async function getBlastPresales(): Promise<BlastFeed> {
  const key = process.env["BLAST_PARTNER_KEY"];
  if (!key) return { ok: false, reason: "no_key", presales: [] };
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  inflight ??= load(key).then((value) => {
    if (value.ok) cache = { at: Date.now(), value };
    inflight = null;
    return value;
  });
  return inflight;
}
