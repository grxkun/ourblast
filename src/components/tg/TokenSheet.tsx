// SPDX-License-Identifier: BUSL-1.1
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tgWalletTokens } from "@/lib/tg/tg.functions";
import type { MarketRow } from "@/lib/tg/market.functions";

const usd = (n: number | null) => n == null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`;

/** Token detail: live Noodles chart + the caller's own W1 bag. */
export function TokenSheet({ row, initData, onClose, onTrade }: { row: MarketRow; initData: string | null; onClose: () => void; onTrade: (coinType: string) => void }) {
  const bag = useQuery({
    queryKey: ["tg-bag", row.coinType], enabled: !!initData, staleTime: 20_000,
    queryFn: () => tgWalletTokens({ data: { initData: initData!, slot: 1 } }),
  });
  const [chartKey, setChartKey] = useState(0);
  const held = bag.data?.tokens.find((t) => t.coinType === row.coinType)?.amount ?? 0;
  const value = row.priceUsd != null ? held * row.priceUsd : null;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-background/70" onClick={onClose}>
      <div role="dialog" aria-label={`${row.symbol} details`} className="mx-auto max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-card p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="min-w-0"><p className="truncate font-display text-xl">${row.symbol}</p><p className="truncate text-[0.65rem] text-muted-foreground">{row.source} · {row.coinType.slice(0, 10)}…</p></div>
          <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close"><X /></Button>
        </div>
        <iframe title={`${row.symbol} chart`} src={`https://noodles.fi/tv-widget?coin=${encodeURIComponent(row.coinType)}&theme=dark`} key={chartKey} className="h-72 w-full rounded-xl border-0 bg-surface" loading="lazy" />
        <div className="mt-1 flex items-center justify-between gap-2 text-[0.65rem] text-muted-foreground"><span>Chart blank? New tokens may have no candles yet, or the chart service is slow.</span><Button size="sm" variant="ghost" onClick={() => setChartKey((k) => k + 1)}>Reload chart</Button></div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-surface p-2"><p className="text-muted-foreground">MC</p><p className="font-semibold">{usd(row.mcapUsd)}</p></div>
          <div className="rounded-xl bg-surface p-2"><p className="text-muted-foreground">Vol 24h</p><p className="font-semibold">{usd(row.volume24h)}</p></div>
          <div className="rounded-xl bg-surface p-2"><p className="text-muted-foreground">Liq</p><p className="font-semibold">{usd(row.liquidityUsd)}</p></div>
        </div>
        <div className="mt-3 rounded-xl border border-border bg-surface p-3 text-sm">
          <p className="text-xs text-muted-foreground">Your bag (W1)</p>
          {!initData ? <p>Open inside Telegram to see your bag.</p> : bag.isLoading ? <p>Loading…</p> : bag.isError ? <div className="flex items-center justify-between gap-2"><p>Couldn't read your wallet — the network didn't answer.</p><Button size="sm" variant="outline" onClick={() => bag.refetch()} disabled={bag.isFetching}>{bag.isFetching ? "Retrying…" : "Try again"}</Button></div> :
            <p className="font-semibold tabular-nums">{held.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${row.symbol} <span className="text-muted-foreground">≈ {usd(value)}</span></p>}
        </div>
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" onClick={() => onTrade(row.coinType)}>Trade</Button>
          <Button variant="outline" asChild><a href={`https://noodles.fi/coins/${row.coinType}`} target="_blank" rel="noreferrer">Noodles</a></Button>
        </div>
      </div>
    </div>
  );
}
