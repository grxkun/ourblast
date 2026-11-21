// SPDX-License-Identifier: BUSL-1.1
/** Candlestick chart image for Telegram: top Sui pool (DexScreener) → OHLCV (GeckoTerminal) → PNG (QuickChart). Read-only. */
import { CHART_TFS } from "@/lib/tg/chart";

type Candle = [number, number, number, number, number, number];

export async function topPool(coinType: string): Promise<string | null> {
  const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${coinType}`, { signal: AbortSignal.timeout(6000) }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { pairs?: { chainId?: string; pairAddress?: string; liquidity?: { usd?: number } }[] } | null;
  const pairs = (j?.pairs ?? []).filter((p) => p.chainId === "sui" && p.pairAddress);
  pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  return pairs[0]?.pairAddress ?? null;
}

export async function candles(pool: string, tf: string, coinType: string): Promise<Candle[]> {
  const c = CHART_TFS[tf]!;
  // token=base prices the candle in the coin we asked about, whichever side of the pool it sits on.
  const url = `https://api.geckoterminal.com/api/v2/networks/sui-network/pools/${pool}/ohlcv/${c.tf}?aggregate=${c.agg}&limit=80&currency=usd&token=${encodeURIComponent(coinType)}`;
  const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(7000) }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { data?: { attributes?: { ohlcv_list?: Candle[] } } } | null;
  return (j?.data?.attributes?.ohlcv_list ?? []).slice().reverse();
}

export async function renderChart(symbol: string, tf: string, list: Candle[]): Promise<string | null> {
  const body = {
    version: "3", backgroundColor: "#0b0f14", width: 900, height: 500, format: "png",
    chart: {
      type: "candlestick",
      data: { datasets: [{ label: `$${symbol} · ${tf}`, data: list.map(([t, o, h, l, c]) => ({ x: t * 1000, o, h, l, c })),
        color: { up: "#22c55e", down: "#ef4444", unchanged: "#94a3b8" } }] },
      options: {
        plugins: { legend: { labels: { color: "#e5e7eb", font: { size: 16 } } }, title: { display: true, text: "OURBLAST", color: "#f97316" } },
        scales: { x: { ticks: { color: "#9ca3af" }, grid: { color: "#1f2937" } }, y: { position: "right", ticks: { color: "#9ca3af" }, grid: { color: "#1f2937" } } },
      },
    },
  };
  const r = await fetch("https://quickchart.io/chart/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { success?: boolean; url?: string } | null;
  return j?.success && j.url ? j.url : null;
}

/** Bonding-curve candles (unbonded launchpad tokens) from YOLO.casa — DEX OHLCV sources only see pools. */
export async function yoloCandles(coinType: string, tf: string): Promise<Candle[]> {
  const r = await fetch(`https://yolo.casa/api/token/${coinType}/candles?tf=${encodeURIComponent(tf)}`, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 OURBLAST" }, signal: AbortSignal.timeout(7000) }).catch(() => null);
  if (!r?.ok) return [];
  const j = (await r.json().catch(() => null)) as { candles?: { time: number; open: number; high: number; low: number; close: number; volume: number }[] } | null;
  return (j?.candles ?? []).slice(-120).map((c) => [c.time, c.open, c.high, c.low, c.close, c.volume] as Candle);
}
