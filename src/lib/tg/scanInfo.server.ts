// SPDX-License-Identifier: BUSL-1.1
/** Read-only token stats for scan cards: Aftermath price + DexScreener pool data + OURBLAST launchpad record. 30s cache. */
import type { ScanStats } from "@/lib/tg/scanner";

const cache = new Map<string, { at: number; v: ScanStats }>();

async function dexStats(coinType: string): Promise<Partial<ScanStats>> {
  const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(coinType)}`, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) return {};
  const j = (await r.json()) as { pairs?: Array<{ dexId?: string; priceUsd?: string; marketCap?: number; fdv?: number; liquidity?: { usd?: number }; volume?: { h24?: number }; priceChange?: { h24?: number }; baseToken?: { address?: string } }> };
  const pairs = (j.pairs ?? []).filter((p) => p.baseToken?.address?.toLowerCase() === coinType.toLowerCase());
  if (!pairs.length) return {};
  const top = pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]!;
  return {
    dex: top.dexId ?? null,
    priceUsd: top.priceUsd ? Number(top.priceUsd) : null,
    mcap: top.marketCap ?? top.fdv ?? null,
    liquidity: pairs.reduce((s, p) => s + (p.liquidity?.usd ?? 0), 0) || null,
    volume24h: pairs.reduce((s, p) => s + (p.volume?.h24 ?? 0), 0) || null,
    change24h: top.priceChange?.h24 ?? null,
    pools: pairs.length,
  };
}

export async function getScanStats(coinType: string): Promise<ScanStats> {
  const hit = cache.get(coinType);
  if (hit && Date.now() - hit.at < 30_000) return hit.v;
  const pkg = coinType.split("::")[0]!;
  const { currentPrice } = await import("@/lib/tg/limitOrder.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [price, dex, pad] = await Promise.all([
    currentPrice(coinType).catch(() => null),
    dexStats(coinType).catch(() => ({})),
    supabaseAdmin.from("x_launch_requests").select("launchpad")
      .or(`token_address.eq.${coinType},token_address.eq.${pkg},token_url.ilike.%${pkg}%`)
      .limit(1).maybeSingle().then((r) => r.data?.launchpad ?? null, () => null),
  ]);
  const v: ScanStats = { priceUsd: null, mcap: null, liquidity: null, volume24h: null, change24h: null, dex: null, pools: 0, ...dex, launchpad: pad };
  if (price != null) { v.priceUsd = price; v.priceSource = "Aftermath"; } else if (v.priceUsd != null) v.priceSource = "DexScreener";
  cache.set(coinType, { at: Date.now(), v });
  return v;
}
