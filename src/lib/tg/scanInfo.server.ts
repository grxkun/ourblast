// SPDX-License-Identifier: BUSL-1.1
/** Read-only token stats for scan cards: Aftermath price + DexScreener pool data + on-chain metadata + OURBLAST launchpad record. 30s cache. */
import { padFromModule, type ScanStats } from "@/lib/tg/scanner";

const GQL = "https://graphql.mainnet.sui.io/graphql";
const cache = new Map<string, { at: number; v: ScanStats }>();

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  const r = await fetch(GQL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(4000) });
  const j = (await r.json()) as { data?: T };
  return j.data ?? null;
}

async function coinMeta(coinType: string): Promise<{ symbol: string | null; name: string | null }> {
  const d = await gql<{ coinMetadata?: { symbol?: string; name?: string } | null }>(
    "query($t:String!){coinMetadata(coinType:$t){symbol name}}", { t: coinType });
  return { symbol: d?.coinMetadata?.symbol ?? null, name: d?.coinMetadata?.name ?? null };
}

async function dexStats(coinType: string): Promise<Partial<ScanStats>> {
  const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(coinType)}`, { headers: { "user-agent": "Mozilla/5.0 ourblast" }, signal: AbortSignal.timeout(4000) });
  if (!r.ok) return {};
  const j = (await r.json()) as { pairs?: Array<{ dexId?: string; priceUsd?: string; marketCap?: number; fdv?: number; liquidity?: { usd?: number }; volume?: { h24?: number }; priceChange?: { h24?: number }; baseToken?: { address?: string; symbol?: string; name?: string } }> };
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
    symbol: top.baseToken?.symbol ?? null,
    name: top.baseToken?.name ?? null,
  };
}

export async function getScanStats(coinType: string): Promise<ScanStats> {
  const hit = cache.get(coinType);
  if (hit && Date.now() - hit.at < 30_000) return hit.v;
  const pkg = coinType.split("::")[0]!;
  const { currentPrice } = await import("@/lib/tg/limitOrder.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [price, dex, meta, pad] = await Promise.all([
    currentPrice(coinType).catch(() => null),
    dexStats(coinType).catch(() => ({}) as Partial<ScanStats>),
    coinMeta(coinType).catch(() => ({ symbol: null, name: null })),
    supabaseAdmin.from("x_launch_requests").select("launchpad")
      .or(`token_address.eq.${coinType},token_address.eq.${pkg},token_url.ilike.%${pkg}%`)
      .limit(1).maybeSingle().then((r) => r.data?.launchpad ?? null, () => null),
  ]);
  const v: ScanStats = { priceUsd: null, mcap: null, liquidity: null, volume24h: null, change24h: null, dex: null, pools: 0, ...dex, launchpad: pad ?? padFromModule(coinType) };
  // On-chain metadata is the source of truth for ticker/name; DexScreener is the fallback.
  v.symbol = meta.symbol ?? dex.symbol ?? null;
  v.name = meta.name ?? dex.name ?? null;
  if (price != null) { v.priceUsd = price; v.priceSource = "Aftermath"; } else if (v.priceUsd != null) v.priceSource = "DexScreener";
  cache.set(coinType, { at: Date.now(), v });
  return v;
}

/** "$HOLMOT" → coin type of a token OURBLAST launched (reads the curve object's type parameter). */
export async function resolveLaunchedTicker(symbol: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("x_launch_requests").select("token_address")
    .ilike("symbol", symbol).not("token_address", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const addr = data?.token_address;
  if (!addr) return null;
  if (addr.includes("::")) return addr;
  const d = await gql<{ object?: { asMoveObject?: { contents?: { type?: { repr?: string } } } } }>(
    "query($a:SuiAddress!){object(address:$a){asMoveObject{contents{type{repr}}}}}", { a: addr }).catch(() => null);
  const repr = d?.object?.asMoveObject?.contents?.type?.repr ?? "";
  return repr.match(/<(0x[a-f0-9]+::\w+::\w+)>/i)?.[1] ?? null;
}
