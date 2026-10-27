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

async function coinMeta(coinType: string): Promise<{ symbol: string | null; name: string | null; supply: number | null; decimals: number | null }> {
  const d = await gql<{ coinMetadata?: { symbol?: string; name?: string; decimals?: number; supply?: string | null } | null }>(
    "query($t:String!){coinMetadata(coinType:$t){symbol name decimals supply}}", { t: coinType });
  const m = d?.coinMetadata;
  const supply = m?.supply != null && m.decimals != null ? Number(m.supply) / 10 ** m.decimals : null;
  return { symbol: m?.symbol ?? null, name: m?.name ?? null, supply: supply && Number.isFinite(supply) ? supply : null, decimals: m?.decimals ?? null };
}

const SUI = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";

/** Live executable price from Aftermath's router: quote 1 SUI → token, priced via SUI/USD. Also names the pool's DEX. */
async function routeQuote(coinType: string, decimals: number): Promise<{ priceUsd: number; dex: string | null } | null> {
  const { aftermathPrices } = await import("@/lib/tg/runCommand.server");
  const [prices, r] = await Promise.all([
    aftermathPrices([SUI]),
    fetch("https://aftermath.finance/api/router/trade-route", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ coinInType: SUI, coinOutType: coinType, coinInAmount: "1000000000" }),
      signal: AbortSignal.timeout(5000),
    }).then((x) => (x.ok ? x.json() : null)),
  ]);
  const suiUsd = prices[SUI];
  const out = Number(String(r?.coinOut?.amount ?? "0").replace(/n$/, "")) / 10 ** decimals;
  if (!suiUsd || !(out > 0)) return null;
  const dex = r?.routes?.[0]?.paths?.[0]?.protocolName ?? null;
  return { priceUsd: suiUsd / out, dex };
}

export async function getScanStats(coinType: string): Promise<ScanStats> {
  const hit = cache.get(coinType);
  if (hit && Date.now() - hit.at < 30_000) return hit.v;
  const pkg = coinType.split("::")[0]!;
  const { aftermathPrices } = await import("@/lib/tg/runCommand.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [priceInfo, meta, pad] = await Promise.all([
    fetch("https://aftermath.finance/api/price-info", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ coins: [coinType] }), signal: AbortSignal.timeout(5000),
    }).then((r) => r.json()).then((j) => (j as Record<string, { price?: number; priceChange24HoursPercentage?: number }>)[coinType] ?? null).catch(() => null),
    coinMeta(coinType).catch(() => ({ symbol: null, name: null, supply: null, decimals: null as number | null })),
    supabaseAdmin.from("x_launch_requests").select("launchpad")
      .or(`token_address.eq.${coinType},token_address.eq.${pkg},token_url.ilike.%${pkg}%`)
      .limit(1).maybeSingle().then((r) => r.data?.launchpad ?? null, () => null),
  ]);
  void aftermathPrices;
  const v: ScanStats = { priceUsd: null, mcap: null, liquidity: null, volume24h: null, change24h: null, dex: null, pools: 0, launchpad: pad ?? padFromModule(coinType) };
  v.symbol = meta.symbol;
  v.name = meta.name;
  if (priceInfo?.price && priceInfo.price > 0) {
    v.priceUsd = priceInfo.price; v.priceSource = "Aftermath";
    if (priceInfo.priceChange24HoursPercentage) v.change24h = priceInfo.priceChange24HoursPercentage;
  }
  // Aftermath's router knows every pool it can trade, even when its price index returns -1.
  const q = meta.decimals != null ? await routeQuote(coinType, meta.decimals).catch(() => null) : null;
  if (q) { if (v.priceUsd == null) { v.priceUsd = q.priceUsd; v.priceSource = "Aftermath route"; } v.dex = q.dex; }
  // Market cap = live price × on-chain total supply.
  if (v.priceUsd != null && meta.supply) v.mcap = v.priceUsd * meta.supply;
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
