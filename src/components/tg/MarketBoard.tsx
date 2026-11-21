// SPDX-License-Identifier: BUSL-1.1
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { tgMarket, type MarketRow, type MarketSort } from "@/lib/tg/market.functions";

const usd = (n: number) => !n ? "—" : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`;
const price = (n: number) => !n ? "—" : n >= 1 ? `$${n.toFixed(3)}` : n >= 0.0001 ? `$${n.toFixed(6)}` : `$${n.toPrecision(3)}`;

export function MarketBoard({ limit, compact, onTrade }: { limit?: number; compact?: boolean; onTrade: (coinType: string) => void }) {
  const [sort, setSort] = useState<MarketSort>("trending");
  const [dex, setDex] = useState("all");
  const q = useQuery({ queryKey: ["tg-market", sort], queryFn: () => tgMarket({ data: { sort } }), refetchInterval: 45_000, staleTime: 30_000 });
  const all = q.data?.rows ?? [];
  const dexes = useMemo(() => ["all", ...Array.from(new Set(all.map((r) => r.dex)))], [all]);
  const rows = all.filter((r) => dex === "all" || r.dex === dex).slice(0, limit ?? 60);

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 overflow-x-auto text-xs">
        {([["trending", "🔥 Trending"], ["new", "🚀 New"], ["volume", "💎 Volume"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => { setSort(k); setDex("all"); }}
            className={`shrink-0 rounded-full px-3 py-1.5 font-semibold ${sort === k ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"}`}>{l}</button>
        ))}
      </div>
      {!compact && dexes.length > 2 && (
        <div className="flex gap-1.5 overflow-x-auto text-[0.65rem]">
          {dexes.map((d) => (
            <button key={d} onClick={() => setDex(d)} className={`shrink-0 rounded-full border px-2.5 py-0.5 font-semibold uppercase ${dex === d ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>{d}</button>
          ))}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-border bg-surface px-3 py-2 text-[0.6rem] font-semibold uppercase text-muted-foreground">
          <span>Token</span><span className="text-right">Price / 24h</span><span className="w-14 text-right">MC / Vol</span>
        </div>
        {q.isLoading && <p className="p-4 text-center text-xs text-muted-foreground">Loading Sui market…</p>}
        {!q.isLoading && rows.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">{q.data?.error ?? "No tokens found."}</p>}
        {rows.map((r: MarketRow, i) => (
          <button key={r.coinType} onClick={() => onTrade(r.coinType)}
            className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-border px-3 py-2 text-left last:border-0 active:bg-surface">
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-4 shrink-0 text-[0.6rem] text-muted-foreground">{i + 1}</span>
              {r.icon ? <img src={r.icon} alt="" loading="lazy" className="h-7 w-7 shrink-0 rounded-full bg-surface object-cover" />
                : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-[0.6rem] font-bold">{r.symbol.slice(0, 2)}</span>}
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">${r.symbol}</span>
                <span className="block truncate text-[0.6rem] uppercase text-muted-foreground">{r.dex}</span>
              </span>
            </span>
            <span className="text-right">
              <span className="block text-xs font-semibold tabular-nums">{price(r.priceUsd)}</span>
              <span className={`block text-[0.65rem] tabular-nums ${r.change24h > 0 ? "text-lime" : r.change24h < 0 ? "text-destructive" : "text-muted-foreground"}`}>{r.change24h > 0 ? "+" : ""}{r.change24h.toFixed(1)}%</span>
            </span>
            <span className="w-14 text-right">
              <span className="block text-xs tabular-nums">{usd(r.mcapUsd)}</span>
              <span className="block text-[0.65rem] tabular-nums text-muted-foreground">{usd(r.volume24h)}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="text-center text-[0.6rem] text-muted-foreground">All Sui DEXes · tap a token to trade</p>
    </div>
  );
}
