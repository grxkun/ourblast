// SPDX-License-Identifier: BUSL-1.1
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink, RefreshCw, X } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { tgWalletTokens } from "@/lib/tg/tg.functions";
import { tgTokenDetail, type MarketRow } from "@/lib/tg/market.functions";

const usd = (n: number | null) => n == null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`;

/** Exact-contract prices and observed curve history; never synthetic candles. */
export function TokenSheet({ row, initData, onClose, onTrade }: { row: MarketRow; initData: string | null; onClose: () => void; onTrade: (coinType: string) => void }) {
  const detailFn = useServerFn(tgTokenDetail);
  const walletFn = useServerFn(tgWalletTokens);
  const detail = useQuery({
    queryKey: ["tg-token-detail", row.coinType],
    queryFn: () => detailFn({ data: { coinType: row.coinType } }),
    staleTime: 8000, refetchInterval: 10_000, refetchOnWindowFocus: true,
  });
  const bag = useQuery({
    queryKey: ["tg-bag", row.coinType], enabled: !!initData, staleTime: 10_000, refetchInterval: 20_000,
    queryFn: () => { if (!initData) throw new Error("Open in Telegram"); return walletFn({ data: { initData, slot: 1 } }); },
  });
  const [chartKey, setChartKey] = useState(0);
  const [src, setSrc] = useState<"curve" | "noodles">("curve");
  const [samples, setSamples] = useState<{ time: number; price: number }[]>([]);
  const [copied, setCopied] = useState(false);
  const current = detail.data;
  const curve = current?.curve;
  const priceUsd = current ? current.priceUsd : row.priceUsd;
  const symbol = current?.symbol ?? row.symbol;
  useEffect(() => {
    if (!current || current.priceUsd == null) return;
    setSamples((prev) => prev.at(-1)?.time === current.observedAt ? prev : [...prev, { time: current.observedAt, price: current.priceUsd ?? 0 }].slice(-180));
  }, [current]);
  const chartUrl = `https://noodles.fi/tv-widget?coin=${encodeURIComponent(row.coinType)}&theme=dark`;
  const links = [
    ...(/blast/i.test(row.source) ? [["Blast.fun", `https://blast.fun/token/${row.coinType}`]] : []),
    ["NOO", `https://noodles.fi/coins/${row.coinType}`], ["YO", `https://yolo.casa/token/${row.coinType}`],
    ["TAV", `https://tavern.family/token/${row.coinType}`], ["SCAN", `https://suiscan.xyz/mainnet/coin/${row.coinType}`],
    ["DS", `https://dexscreener.com/sui/${row.coinType}`], ["DEF", `https://www.defined.fi/sui/${row.coinType}`],
  ];
  const copy = async () => {
    try { await navigator.clipboard.writeText(row.coinType); setCopied(true); }
    catch {
      const field = document.createElement("textarea");
      field.value = row.coinType;
      field.setAttribute("readonly", "");
      document.body.append(field);
      field.select();
      const ok = document.execCommand("copy");
      field.remove();
      if (ok) setCopied(true); else toast.error("Couldn't copy contract");
    }
  };
  const held = bag.data?.tokens.find((t) => t.coinType === row.coinType)?.amount ?? 0;
  const value = priceUsd != null ? held * priceUsd : null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-background/70" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`${row.symbol} details`} className="mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-lg border border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="min-w-0"><p className="truncate font-display text-xl">${symbol}</p><p className="truncate text-xs text-muted-foreground">{curve?.factory ?? row.source} · {curve ? curve.live ? "Bonding curve" : "Graduated" : row.dex}</p></div>
          <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close"><X /></Button>
        </div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div><p className="text-2xl font-semibold tabular-nums">{priceUsd == null ? "—" : `$${priceUsd.toPrecision(5)}`}</p><p className="text-[0.65rem] text-muted-foreground">{detail.isError ? "Update failed · last observation" : current ? `${current.source ?? "Price unavailable"} · ${new Date(current.observedAt).toLocaleTimeString()}` : "Loading live price…"}</p></div>
          <Button size="icon-sm" variant="outline" aria-label="Refresh token" title="Refresh token" disabled={detail.isFetching} onClick={() => { void detail.refetch(); void bag.refetch(); }}><RefreshCw className={detail.isFetching ? "animate-spin" : ""} /></Button>
        </div>
        {curve?.live && <section className="mb-3 border-y border-border py-3 text-xs">
          <div className="flex justify-between"><span>Graduation</span><strong>{curve.progress == null ? "—" : `${(curve.progress * 100).toFixed(2)}%`}</strong></div>
          {curve.progress != null && <progress aria-label="Bonding progress" max={1} value={curve.progress} className="my-2 h-2 w-full accent-primary" />}
          <p className="text-muted-foreground">Real reserve: {curve.reserveSui == null ? "—" : `${curve.reserveSui.toLocaleString(undefined, { maximumFractionDigits: 3 })} SUI`}{curve.targetSui != null ? ` / ${curve.targetSui.toLocaleString()} SUI target` : ""}</p>
        </section>}
        <div className="mb-2 flex items-center gap-1">
          <Button size="sm" variant={src === "curve" ? "secondary" : "ghost"} onClick={() => setSrc("curve")} aria-pressed={src === "curve"}>Live spot</Button>
          <Button size="sm" variant={src === "noodles" ? "secondary" : "ghost"} onClick={() => setSrc("noodles")} aria-pressed={src === "noodles"}>Noodles</Button>
          {src === "noodles" && <Button size="icon-sm" variant="ghost" aria-label="Reload chart" title="Reload chart" onClick={() => setChartKey((k) => k + 1)}><RefreshCw /></Button>}
        </div>
        {src === "noodles" ? <iframe title={`${symbol} chart`} src={chartUrl} key={chartKey} className="h-64 w-full rounded-lg border-0 bg-surface" loading="lazy" /> : <div className="h-48 w-full bg-surface">
          {samples.length >= 2 ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={samples} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}>
            <XAxis dataKey="time" tickFormatter={(n: number) => new Date(n).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" })} minTickGap={55} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
            <YAxis domain={["auto", "auto"]} hide />
            <Tooltip labelFormatter={(n) => new Date(Number(n)).toLocaleTimeString()} formatter={(n: number) => [`$${n.toPrecision(5)}`, "Spot"]} contentStyle={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
            <Area type="linear" dataKey="price" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.12} isAnimationActive={false} />
          </AreaChart></ResponsiveContainer> : <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground"><RefreshCw className="size-5" /><p>{priceUsd == null ? "Live price unavailable" : "Waiting for next price observation…"}</p></div>}
        </div>}
        <p className="mt-1 text-[0.65rem] text-muted-foreground">{src === "curve" ? "Observed since opening · refresh every 10s" : "Noodles · candles unavailable until indexed"}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 border-y border-border py-3 text-center text-xs">
          <div><p className="text-muted-foreground">{curve?.live ? "FDV" : "MC"}</p><p className="font-semibold">{usd(curve?.live ? current?.fdvUsd ?? null : row.mcapUsd)}</p></div>
          <div><p className="text-muted-foreground">Vol 24h</p><p className="font-semibold">{usd(row.volume24h)}</p></div>
          <div><p className="text-muted-foreground">{curve?.live ? "Spot / SUI" : "Liq"}</p><p className="font-semibold">{curve?.live ? curve.priceSui?.toPrecision(4) ?? "—" : usd(row.liquidityUsd)}</p></div>
        </div>
        <div className="mt-3 flex items-start gap-2">
          <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Contract</p><p className="break-all font-mono text-[0.65rem]">{row.coinType}</p></div>
          <Button size="icon-sm" variant="ghost" aria-label={copied ? "Contract copied" : "Copy contract"} title={copied ? "Copied" : "Copy contract"} onClick={() => void copy()}><Copy /></Button>
        </div>
        {curve?.creator && <p className="mt-2 break-all text-xs text-muted-foreground">Creator: <a className="text-primary underline" href={`https://suiscan.xyz/mainnet/account/${curve.creator}`} target="_blank" rel="noreferrer">{curve.creator}</a></p>}
        <nav aria-label="Token links" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-primary">{links.map(([name, url]) => <a key={name} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">{name}<ExternalLink className="size-3" /></a>)}</nav>
        <div className="mt-3 border-t border-border py-3 text-sm">
          <p className="text-xs text-muted-foreground">Your bag (W1)</p>
          {!initData ? <p>Open inside Telegram to see your bag.</p> : bag.isLoading ? <p>Loading…</p> : bag.isError ? <div className="flex items-center justify-between gap-2"><p>Couldn't read your wallet — the network didn't answer.</p><Button size="sm" variant="outline" onClick={() => bag.refetch()} disabled={bag.isFetching}>{bag.isFetching ? "Retrying…" : "Try again"}</Button></div> :
            <p className="font-semibold tabular-nums">{held.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${symbol} <span className="text-muted-foreground">≈ {usd(value)}</span></p>}
        </div>
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" onClick={() => onTrade(row.coinType)}>Trade</Button>
          <Button variant="outline" asChild><a href={`https://yolo.casa/token/${row.coinType}`} target="_blank" rel="noreferrer"><ExternalLink />Chart</a></Button>
        </div>
      </div>
    </div>
  );
}
