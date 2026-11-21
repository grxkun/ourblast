// SPDX-License-Identifier: BUSL-1.1
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type MarketSort = "trending" | "new" | "volume";
export interface MarketRow {
  coinType: string; symbol: string; name: string; icon: string | null; dex: string;
  priceUsd: number; change24h: number; mcapUsd: number; volume24h: number; liquidityUsd: number; txns24h: number;
}

const PATH: Record<MarketSort, string> = { trending: "trending_pools", new: "new_pools", volume: "pools?sort=h24_volume_usd_desc&" };
const cache = new Map<MarketSort, { at: number; rows: MarketRow[] }>();
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

type Gt = { data?: Array<{ attributes: Record<string, unknown>; relationships: Record<string, { data?: { id: string } }> }>; included?: Array<{ id: string; type: string; attributes: Record<string, unknown> }> };

/** Sui-wide token board (all DEXes) from GeckoTerminal, one row per base token, cached 45s. */
export const tgMarket = createServerFn({ method: "GET" })
  .inputValidator(z.object({ sort: z.enum(["trending", "new", "volume"]) }))
  .handler(async ({ data }): Promise<{ rows: MarketRow[]; error: string | null }> => {
    const hit = cache.get(data.sort);
    if (hit && Date.now() - hit.at < 45_000) return { rows: hit.rows, error: null };
    try {
      const p = PATH[data.sort];
      const url = `https://api.geckoterminal.com/api/v2/networks/sui-network/${p}${p.includes("?") ? "" : "?"}page=1&include=base_token,dex`;
      const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as Gt;
      const inc = new Map((j.included ?? []).map((i) => [`${i.type}:${i.id}`, i.attributes]));
      const seen = new Set<string>();
      const rows: MarketRow[] = [];
      for (const pool of j.data ?? []) {
        const a = pool.attributes;
        const tid = pool.relationships["base_token"]?.data?.id ?? "";
        const t = inc.get(`token:${tid}`) ?? {};
        const coinType = String(t["address"] ?? tid.replace(/^sui-network_/, ""));
        if (!coinType || coinType === "0x2::sui::SUI" || seen.has(coinType)) continue;
        seen.add(coinType);
        const dexId = pool.relationships["dex"]?.data?.id ?? "";
        const tx = (a["transactions"] as Record<string, { buys?: number; sells?: number }> | undefined)?.["h24"];
        rows.push({
          coinType, symbol: String(t["symbol"] ?? "?"), name: String(t["name"] ?? ""),
          icon: typeof t["image_url"] === "string" && t["image_url"].startsWith("http") ? t["image_url"] : null,
          dex: String(inc.get(`dex:${dexId}`)?.["name"] ?? dexId),
          priceUsd: num(a["base_token_price_usd"]),
          change24h: num((a["price_change_percentage"] as Record<string, unknown> | undefined)?.["h24"]),
          mcapUsd: num(a["market_cap_usd"]) || num(a["fdv_usd"]),
          volume24h: num((a["volume_usd"] as Record<string, unknown> | undefined)?.["h24"]),
          liquidityUsd: num(a["reserve_in_usd"]),
          txns24h: num(tx?.buys) + num(tx?.sells),
        });
      }
      cache.set(data.sort, { at: Date.now(), rows });
      return { rows, error: null };
    } catch (e) {
      console.error("tgMarket", e);
      return { rows: hit?.rows ?? [], error: "Market data unavailable right now" };
    }
  });
