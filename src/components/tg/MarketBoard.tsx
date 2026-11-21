// SPDX-License-Identifier: BUSL-1.1
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, RefreshCw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tgMarket, type MarketRow, type MarketSort } from "@/lib/tg/market.functions";

const usd = (n: number | null) => n === null ? "—" : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`;
const price = (n: number | null) => n === null ? "—" : n >= 1 ? `$${n.toFixed(3)}` : n >= 0.0001 ? `$${n.toFixed(6)}` : `$${n.toPrecision(3)}`;

export function MarketBoard({ limit, compact, onTrade }: { limit?: number; compact?: boolean; onTrade: (coinType: string) => void }) {
  const [sort, setSort] = useState<MarketSort>("trending");
  const [venue, setVenue] = useState("all");
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(40);
  const q = useQuery({ queryKey: ["tg-market", sort], queryFn: () => tgMarket({ data: { sort } }), refetchInterval: 45_000, staleTime: 30_000 });
  const all = q.data?.rows ?? [];
  const venues = useMemo(() => ["all", ...Array.from(new Set(all.flatMap((r) => [r.source, r.dex])))], [all]);
  const term = search.trim().replace(/^\$/, "").toLowerCase();
  const filtered = all.filter((r) => (venue === "all" || r.source === venue || r.dex === venue) && (!term || `${r.symbol} ${r.name} ${r.coinType}`.toLowerCase().includes(term)));
  const rows = filtered.slice(0, limit ?? visible);

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex gap-1 overflow-x-auto text-xs" aria-label="Market categories">
        {([["trending", "Trending"], ["new", "New launches"], ["volume", "Volume"], ["main", "Main tokens"]] as const).map(([k, l]) => (
          <Button key={k} size="sm" variant={sort === k ? "default" : "secondary"} onClick={() => { setSort(k); setVenue("all"); setVisible(40); }} className="shrink-0 px-2.5" aria-pressed={sort === k}>{l}</Button>
        ))}
      </div>
      {!compact && <>
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input aria-label="Search Sui market" placeholder="Search token or contract" value={search} onChange={(e) => { setSearch(e.target.value); setVisible(40); }} className="h-9 pl-8 text-xs" />
          </div>
          <Button size="icon-sm" variant="outline" title="Refresh market" aria-label="Refresh market" disabled={q.isFetching} onClick={() => void q.refetch()}><RefreshCw className={q.isFetching ? "animate-spin" : ""} /></Button>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {venues.map((v) => <Button key={v} size="sm" variant={venue === v ? "default" : "outline"} className="h-7 shrink-0 px-2 text-[0.65rem]" onClick={() => { setVenue(v); setVisible(40); }} aria-pressed={venue === v}>{v === "all" ? "All venues" : v}</Button>)}
        </div>
      </>}
      {q.data?.error && <p role="status" className="text-xs text-muted-foreground">{q.data.error}</p>}
      <div className="overflow-hidden rounded-lg border border-border bg-card" aria-label="Sui market tokens">
        <div className="grid grid-cols-[minmax(0,1fr)_5.7rem_4.4rem] gap-1 border-b border-border bg-surface px-2.5 py-2 text-[0.6rem] font-semibold uppercase text-muted-foreground">
          <span>Token</span><span className="text-right">Price / 24h</span><span className="text-right">MC / Vol</span>
        </div>
        {q.isLoading && <p className="p-4 text-center text-xs text-muted-foreground">Loading Sui market…</p>}
        {!q.isLoading && rows.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">{q.isError ? "Market unavailable. Try refresh." : "No matching tokens."}</p>}
        {rows.map((r: MarketRow) => (
          <Button key={r.coinType} variant="ghost" onClick={() => onTrade(r.coinType)} aria-label={`Trade ${r.symbol}`}
            className="grid h-auto w-full grid-cols-[minmax(0,1fr)_5.7rem_4.4rem] items-center gap-1 whitespace-normal rounded-none border-b border-border px-2.5 py-2 text-left last:border-0">
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-[0.6rem] font-bold">{r.symbol.slice(0, 2)}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">${r.symbol}</span>
                <span title={r.coinType} className="block truncate text-[0.6rem] text-muted-foreground">{r.source} · {r.coinType.slice(2, 6)}</span>
              </span>
            </span>
            <span className="text-right">
              <span className="block text-xs font-semibold tabular-nums">{price(r.priceUsd)}</span>
              <span className={`block text-[0.65rem] tabular-nums ${r.change24h !== null && r.change24h > 0 ? "text-lime" : r.change24h !== null && r.change24h < 0 ? "text-destructive" : "text-muted-foreground"}`}>{r.change24h === null ? "—" : `${r.change24h > 0 ? "+" : ""}${r.change24h.toFixed(1)}%`}</span>
            </span>
            <span className="text-right">
              <span className="block text-xs tabular-nums">{usd(r.mcapUsd)}</span>
              <span className="block text-[0.65rem] tabular-nums text-muted-foreground">{usd(r.volume24h)}</span>
            </span>
          </Button>
        ))}
      </div>
      {!compact && <div className="flex items-center justify-between text-[0.65rem] text-muted-foreground">
        <span>{filtered.length} tokens{q.dataUpdatedAt ? ` · ${new Date(q.dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
        {rows.length < filtered.length && <Button size="sm" variant="ghost" onClick={() => setVisible((n) => n + 40)}><ChevronDown />More</Button>}
      </div>}
    </div>
  );
}
