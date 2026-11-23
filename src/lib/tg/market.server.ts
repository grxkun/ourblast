// SPDX-License-Identifier: BUSL-1.1
import { createClient } from "@supabase/supabase-js";
import { MAIN_TOKENS } from "@/lib/terminal/mainTokens";
import { canonicalCoin, emptyMarketRow, marketNumber, mergeMarket, sortMarket, type MarketRow, type MarketSort } from "./market";

const cache = new Map<MarketSort, { at: number; rows: MarketRow[]; error: string | null }>();
const pending = new Map<MarketSort, Promise<{ rows: MarketRow[]; error: string | null }>>();
const paths = { trending: "trending_pools", new: "new_pools", volume: "pools", main: "pools" };
type Gt = { data?: Array<{ attributes: Record<string, unknown>; relationships: Record<string, { data?: { id: string } }> }>; included?: Array<{ id: string; type: string; attributes: Record<string, unknown> }> };
export async function loadMarket(sort: MarketSort): Promise<{ rows: MarketRow[]; error: string | null }> {
  const hit = cache.get(sort);
  if (hit && Date.now() - hit.at < 45_000) return { rows: hit.rows, error: hit.error };
  const active = pending.get(sort); if (active) return active;
  const job = (async () => {
    const catalog = MAIN_TOKENS.map((t) => emptyMarketRow(t.coinType, t.symbol, t.name, "Sui · Curated"));
    catalog.unshift(emptyMarketRow("0x2::sui::SUI", "SUI", "Sui", "Sui · Curated"));
    const warnings: string[] = [];
    const [stored, pools] = await Promise.all([
      (async () => {
        const key = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'];
        const publicDb = createClient(import.meta.env['VITE_SUPABASE_URL'], key, { auth: { persistSession: false }, global: { fetch: (input, init) => {
          const h = new Headers(init?.headers); h.delete("Authorization"); h.set("apikey", key);
          return fetch(input, { ...init, headers: h, signal: AbortSignal.timeout(6000) });
        } } });
        const { data, error } = await publicDb.from("sui_market_catalog").select("coin_type,symbol,name,source,launched_at").order("launched_at", { ascending: false, nullsFirst: false }).limit(2000);
        if (error) throw error;
        return (data ?? []).map((t) => emptyMarketRow(t.coin_type, t.symbol, t.name, t.source, t.launched_at));
      })().catch(() => { warnings.push("Launchpad catalog temporarily unavailable"); return []; }),
      (async () => {
        const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/sui-network/${paths[sort]}?include=base_token,dex&page=1${sort === "volume" ? "&sort=h24_volume_usd_desc" : ""}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error("Market prices unavailable");
        const j = await r.json() as Gt;
        const inc = new Map((j.included ?? []).map((i) => [`${i.type}:${i.id}`, i.attributes]));
        const out: MarketRow[] = [];
        for (const pool of j.data ?? []) {
          const a = pool.attributes, tid = pool.relationships["base_token"]?.data?.id ?? "";
          const t = inc.get(`token:${tid}`) ?? {}, coin = canonicalCoin(String(t["address"] ?? ""));
          if (!coin) continue;
          const did = pool.relationships["dex"]?.data?.id ?? "";
          const dex = String(inc.get(`dex:${did}`)?.["name"] ?? did);
          const tx = (a["transactions"] as Record<string, { buys?: number; sells?: number }> | undefined)?.["h24"];
          out.push({ ...emptyMarketRow(coin, String(t["symbol"] ?? "?"), String(t["name"] ?? ""), dex), dex,
            priceUsd: marketNumber(a["base_token_price_usd"]), change24h: marketNumber((a["price_change_percentage"] as Record<string, unknown> | undefined)?.["h24"]),
            mcapUsd: marketNumber(a["market_cap_usd"]), fdvUsd: marketNumber(a["fdv_usd"]),
            volume24h: marketNumber((a["volume_usd"] as Record<string, unknown> | undefined)?.["h24"]), liquidityUsd: marketNumber(a["reserve_in_usd"]), txns24h: (tx?.buys ?? 0) + (tx?.sells ?? 0) });
        }
        return out;
      })().catch(() => { warnings.push("Live DEX prices temporarily unavailable"); return hit?.rows.filter((r) => r.priceUsd !== null).map((r) => ({ ...r, priceUsd: null, change24h: null, mcapUsd: null, fdvUsd: null, volume24h: null })) ?? []; }),
    ]);
    const merged = mergeMarket([...catalog, ...stored], pools);
    const unpriced = merged.filter((r) => r.priceUsd === null);
    // A catalog token need not have a trending pool. Resolve actual prices separately,
    // without inventing volume, change or market cap for unindexed curves.
    const livePrices = new Map<string, number>();
    const batches: MarketRow[][] = [];
    for (let i = 0; i < unpriced.length; i += 100) batches.push(unpriced.slice(i, i + 100));
    await Promise.all(batches.map(async (batch) => {
      try {
        const r = await fetch("https://aftermath.finance/api/price-info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ coins: batch.map((t) => t.coinType) }), signal: AbortSignal.timeout(6000) });
        if (!r.ok) return;
        const j = await r.json() as Record<string, { price?: number }>;
        for (const [type, value] of Object.entries(j)) {
          const key = canonicalCoin(type);
          if (key && typeof value.price === "number" && Number.isFinite(value.price) && value.price > 0) livePrices.set(key, value.price);
        }
      } catch { /* Unavailable prices remain null. */ }
    }));
    // Fill USD volume / market cap for catalog tokens with no GeckoTerminal pool (e.g. Blast.fun).
    const ds = new Map<string, Partial<MarketRow>>();
    const missing = merged.filter((r) => r.volume24h === null).slice(0, 900);
    const dsBatches: MarketRow[][] = [];
    for (let i = 0; i < missing.length; i += 30) dsBatches.push(missing.slice(i, i + 30));
    await Promise.all(dsBatches.map(async (batch) => {
      try {
        const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${batch.map((t) => t.coinType).join(",")}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(6000) });
        if (!r.ok) return;
        const j = await r.json() as { pairs?: Array<{ chainId?: string; baseToken?: { address?: string }; priceUsd?: string; volume?: { h24?: number }; priceChange?: { h24?: number }; marketCap?: number; fdv?: number; liquidity?: { usd?: number } }> };
        for (const p of j.pairs ?? []) {
          if (p.chainId !== "sui") continue;
          const key = canonicalCoin(String(p.baseToken?.address ?? "")); if (!key) continue;
          const prev = ds.get(key), liq = marketNumber(p.liquidity?.usd);
          const vol = (marketNumber(p.volume?.h24) ?? 0) + (prev?.volume24h ?? 0);
          if (!prev || (liq ?? 0) > (prev.liquidityUsd ?? 0)) ds.set(key, { priceUsd: marketNumber(p.priceUsd), change24h: marketNumber(p.priceChange?.h24), mcapUsd: marketNumber(p.marketCap), fdvUsd: marketNumber(p.fdv), liquidityUsd: liq, volume24h: vol });
          else prev.volume24h = vol;
        }
      } catch { /* stays null */ }
    }));
    // Unbonded launchpad tokens: the on-chain curve is the truth; DEX aggregators show stale dust pools.
    const curve = new Map<string, Partial<MarketRow>>();
    const suiUsd = livePrices.get(canonicalCoin("0x2::sui::SUI") ?? "") ?? await fetch("https://aftermath.finance/api/price-info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ coins: ["0x2::sui::SUI"] }), signal: AbortSignal.timeout(5000) })
      .then((r) => r.json() as Promise<Record<string, { price?: number }>>).then((j) => j["0x2::sui::SUI"]?.price ?? null).catch(() => null);
    const curveRows = merged.filter((r) => /blast|suipump|perps/i.test(r.source)).sort((a, b) => Number(b.priceUsd != null || ds.has(b.coinType)) - Number(a.priceUsd != null || ds.has(a.coinType))).slice(0, 120);
    if (suiUsd) {
      const [{ readCoinMetadata }, { readCurve }] = await Promise.all([import("@/lib/terminal/sui-balances.server"), import("./curvePrice.server")]);
      await Promise.all(curveRows.map(async (r) => {
        try {
          const meta = await readCoinMetadata(r.coinType); if (!meta) return;
          const c = await readCurve(r.coinType, meta.decimals); if (!c?.live) return;
          const px = c.priceUsd ?? (c.priceSui != null ? c.priceSui * suiUsd : null);
          if (!px || !Number.isFinite(px)) return;
          curve.set(r.coinType, { priceUsd: px, mcapUsd: null, fdvUsd: c.totalSupply ? px * c.totalSupply : null, liquidityUsd: null });
        } catch { /* keep other sources */ }
      }));
    }
    const rows = sortMarket(merged.map((r) => {
      const cv = curve.get(r.coinType);
      if (cv) { const d = ds.get(r.coinType); return { ...r, ...cv, change24h: r.change24h ?? d?.change24h ?? null, volume24h: r.volume24h ?? d?.volume24h ?? null } as MarketRow; }
      const d = ds.get(r.coinType);
      const base = d ? { ...r, priceUsd: r.priceUsd ?? d.priceUsd ?? null, change24h: r.change24h ?? d.change24h ?? null, mcapUsd: r.mcapUsd ?? d.mcapUsd ?? null, fdvUsd: r.fdvUsd ?? d.fdvUsd ?? null, liquidityUsd: r.liquidityUsd ?? d.liquidityUsd ?? null, volume24h: d.volume24h ?? null } : r;
      return base.priceUsd === null && livePrices.has(r.coinType) ? { ...base, priceUsd: livePrices.get(r.coinType) ?? null } : base;
    }), sort);
    const result = { rows, error: warnings.length ? warnings.join(" · ") : null };
    cache.set(sort, { at: Date.now(), ...result }); return result;
  })();
  pending.set(sort, job);
  try { return await job; } finally { pending.delete(sort); }
}