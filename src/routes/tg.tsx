// SPDX-License-Identifier: BUSL-1.1
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownToLine, Copy, ExternalLink, HelpCircle, Home, RefreshCw, Repeat, Rocket, Search, Send, Star, Wallet, X, Zap } from "lucide-react";
import logo from "@/assets/blast-logo.jpg.asset.json";
import mascot from "@/assets/blast-cool.png.asset.json";
import { toast } from "sonner";

import { buildTradeCommand } from "@/lib/tg/tradeCommand";
import { listPublicLaunches } from "@/lib/terminal/launch-status.functions";
import { tgBlastPresales, tgGetBankWallet, tgLinkX, tgRunCommand, tgSession, tgToggleWatch, tgUnlinkX } from "@/lib/tg/tg.functions";

const launchesQuery = queryOptions({
  queryKey: ["public-launches"],
  queryFn: () => listPublicLaunches(),
  refetchInterval: 20_000,
});

export const Route = createFileRoute("/tg")({
  loader: ({ context }) => context.queryClient.ensureQueryData(launchesQuery),
  head: () => ({
    meta: [
      { title: "OURBLAST for Telegram — Sui launches" },
      { name: "description", content: "Track live Sui token launches from @Ourblastbot and keep a private watchlist inside Telegram." },
      { property: "og:title", content: "OURBLAST for Telegram" },
      { property: "og:description", content: "Live Sui launches and a private watchlist, right inside Telegram." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    scripts: [{ src: "https://telegram.org/js/telegram-web-app.js" }],
  }),
  component: TgApp,
});

const PrivyXLink = lazy(() => import("@/components/tg/PrivyXLink"));

type Session = { name: string; username: string | null; xUsername: string | null; privyAppId: string | null; watchlist: string[] };
declare global {
  interface Window { Telegram?: { WebApp?: { initData: string; ready: () => void; expand: () => void } } }
}

function TgApp() {
  const { data: launches } = useSuspenseQuery(launchesQuery);
  const startSession = useServerFn(tgSession);
  const toggle = useServerFn(tgToggleWatch);
  const linkX = useServerFn(tgLinkX);
  const unlinkX = useServerFn(tgUnlinkX);
  const [initData, setInitData] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [filter, setFilter] = useState<"live" | "watch">("live");
  const [q, setQ] = useState("");
  const [help, setHelp] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [preset, setPreset] = useState<TradePreset | null>(null);
  const open = openId ? launches.find((l) => l.id === openId) ?? null : null;

  useEffect(() => {
    let tries = 0;
    const t = setInterval(() => {
      const wa = window.Telegram?.WebApp;
      if (wa || ++tries > 20) {
        clearInterval(t);
        if (wa?.initData) {
          wa.ready(); wa.expand();
          setInitData(wa.initData);
          startSession({ data: { initData: wa.initData } }).then(setSession).catch((e) => setError(String(e.message ?? e)));
        } else setError("Open this page from the OURBLAST Telegram bot to save a watchlist.");
      }
    }, 150);
    return () => clearInterval(t);
  }, [startSession]);

  const watch = useMemo(() => new Set(session?.watchlist ?? []), [session]);
  const rows = (filter === "watch" ? launches.filter((l) => watch.has(l.id)) : launches)
    .filter((l) => !q || `${l.symbol ?? ""} ${l.xUsername ?? ""} ${l.launchpad ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 60);

  async function onStar(id: string) {
    if (!initData || !session) return;
    const r = await toggle({ data: { initData, launchId: id } });
    setSession({ ...session, watchlist: r.watching ? [...session.watchlist, id] : session.watchlist.filter((x) => x !== id) });
  }

  const onPrivyToken = useCallback(async (privyToken: string) => {
    if (!initData) return;
    try {
      const r = await linkX({ data: { initData, privyToken } });
      setSession((s) => (s ? { ...s, xUsername: r.xUsername } : s));
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }, [initData, linkX]);

  const xCard = session && (
    <div className="rounded-lg border border-border bg-card p-3 text-sm">
      {session.xUsername ? (
        <div className="flex items-center justify-between">
          <span>X linked: <b>@{session.xUsername}</b></span>
          <button className="text-xs text-muted-foreground underline" onClick={async () => {
            if (!initData) return;
            await unlinkX({ data: { initData } });
            setSession({ ...session, xUsername: null });
          }}>Unlink</button>
        </div>
      ) : session.privyAppId ? (
        <div className="space-y-2">
          <p className="text-muted-foreground">Connect your X account to open your OurBank wallet.</p>
          <ClientOnly fallback={null}>
            <Suspense fallback={<div className="text-muted-foreground">Loading…</div>}>
              <PrivyXLink appId={session.privyAppId} onToken={onPrivyToken} />
            </Suspense>
          </ClientOnly>
        </div>
      ) : (
        <span className="text-muted-foreground">X linking is not set up yet.</span>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );

  const statusTone = (s: string) =>
    /deploy|live|success/i.test(s) ? "bg-lime/15 text-lime" : /fail|unavail/i.test(s) ? "bg-destructive/15 text-destructive" : "bg-cyber/15 text-cyber";

  const list = (items: typeof launches, ranked = false) => (
    <ul className="space-y-2">
      {items.length === 0 && <li className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted-foreground">Nothing here yet.</li>}
      {items.map((l, i) => (
        <li key={l.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
          {ranked && <span className="w-4 text-center font-display text-sm text-muted-foreground">{i + 1}</span>}
          <button onClick={() => setOpenId(l.id)} aria-label={`Open $${l.symbol ?? "token"}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-2 font-display text-sm text-primary">
            {(l.symbol ?? "?").slice(0, 3)}
          </button>
          <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setOpenId(l.id)}>
            <div className="truncate font-semibold">${l.symbol ?? "?"} <span className="text-xs font-normal text-muted-foreground">{l.name}</span></div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
              <span className="rounded-full bg-surface-2 px-2 py-0.5 uppercase">{l.launchpad}</span>
              <span className="truncate">@{l.xUsername}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase ${statusTone(l.status)}`}>{l.status}</span>
            <div className="flex items-center gap-2">
              {l.tokenUrl && <a href={l.tokenUrl} target="_blank" rel="noreferrer" aria-label="Open token"><ExternalLink className="h-4 w-4 text-muted-foreground" /></a>}
              <button aria-label="Toggle watchlist" disabled={!session} onClick={() => onStar(l.id)}>
                <Star className={`h-4 w-4 ${watch.has(l.id) ? "fill-primary text-primary" : "text-muted-foreground"}`} />
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <main className="mx-auto min-h-screen max-w-md bg-background px-4 pt-4 pb-24 text-foreground">
      <header className="mb-4 flex items-center gap-3">
        <img src={logo.url} alt="OURBLAST logo" width={40} height={40} className="size-10 rounded-xl border-2 border-border object-cover" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl leading-none">OUR<span className="text-primary">BLAST</span></h1>
          <p className="truncate text-xs text-muted-foreground">{session ? `gm ${session.name}` : (error ?? "Connecting to Telegram…")}</p>
        </div>
        <button onClick={() => setHelp(true)} aria-label="How to use" className="flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold">
          <HelpCircle className="h-4 w-4 text-primary" />Guide
        </button>
      </header>
      {help && <GuideSheet onClose={() => setHelp(false)} onGo={(t) => { setTab(t); setHelp(false); }} />}

      {tab === "home" && (
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/30 via-surface to-cyber/20 p-4 shadow-glow">
            <img src={mascot.url} alt="OURBLAST mascot" className="absolute -right-4 -bottom-4 h-36 w-36 object-contain" />
            <p className="max-w-[60%] font-display text-2xl leading-tight">NEW MEMES<br /><span className="text-primary">NEW OPPORTUNITIES</span></p>
            <p className="mt-1 max-w-[60%] text-xs text-muted-foreground">Discover · Trade · Launch on Sui</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["SUI", "SUIPUMP", "PERPSPLEXITY"].map((t) => (
                <span key={t} className="rounded-full border border-border bg-background/70 px-2 py-0.5 text-[0.6rem] font-semibold">{t}</span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {([
              ["discover", "New launches", "Fresh on Sui", Rocket, "text-primary"],
              ["discover", `Watchlist (${watch.size})`, "Your starred tokens", Star, "text-lime"],
              ["wallet", "My wallet", "Balance & deposits", Wallet, "text-cyber"],
              ["trade", "Trade & launch", "Bot commands", Zap, "text-grape"],
            ] as const).map(([t, title, sub, Icon, tone], i) => (
              <button key={i} onClick={() => { setTab(t); if (i === 1) setFilter("watch"); else if (i === 0) setFilter("live"); }}
                className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface p-3 text-left">
                <Icon className={`h-7 w-7 shrink-0 ${tone}`} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{title}</div>
                  <div className="truncate text-[0.7rem] text-muted-foreground">{sub}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg">LATEST LAUNCHES</h2>
            <button className="text-xs font-semibold text-primary" onClick={() => { setFilter("live"); setTab("discover"); }}>See all</button>
          </div>
          {list(launches.slice(0, 5), true)}
        </div>
      )}

      {tab === "discover" && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ticker, creator or launchpad"
              className="w-full bg-transparent text-sm outline-none" />
          </label>
          <div className="flex gap-2 overflow-x-auto">
            {(["live", "watch"] as const).map((t) => (
              <button key={t} onClick={() => setFilter(t)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold ${filter === t ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"}`}>
                {t === "live" ? "Live launches" : `Watchlist (${watch.size})`}
              </button>
            ))}
          </div>
          <BlastPresales />
          {list(rows)}
        </div>
      )}

      {open && (
        <TokenSheet l={open} watching={watch.has(open.id)} onStar={() => onStar(open.id)} onClose={() => setOpenId(null)}
          onTrade={(side) => { setPreset({ side, token: open.symbol ?? "", key: Date.now() }); setOpenId(null); setTab("trade"); }} />
      )}

      {tab === "trade" && (
        session?.xUsername && initData
          ? <TradeTerminal initData={initData} preset={preset} />
          : <div className="space-y-3"><p className="text-sm text-muted-foreground">Link your X account to trade from your OurBank wallet.</p>{xCard}</div>
      )}

      {tab === "wallet" && (
        <div className="space-y-3">
          {xCard}
          {session?.xUsername && initData && <WalletView initData={initData} handle={session.xUsername} onTrade={() => setTab("trade")} />}
        </div>
      )}

      <nav className="fixed bottom-0 left-0 z-50 w-full border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-4">
          {([["home", "Home", Home], ["discover", "Discover", Search], ["trade", "Trade", Zap], ["wallet", "Wallet", Wallet]] as const).map(([t, label, Icon]) => (
            <button key={t} onClick={() => setTab(t)} className={`flex flex-col items-center gap-0.5 py-2 text-[0.65rem] font-semibold uppercase ${tab === t ? "text-primary" : "text-muted-foreground"}`}>
              <Icon className="h-5 w-5" />{label}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}

type Tab = "home" | "discover" | "trade" | "wallet";

type LaunchRow = Awaited<ReturnType<typeof listPublicLaunches>>[number];

function TokenSheet({ l, watching, onStar, onClose, onTrade }: {
  l: LaunchRow; watching: boolean; onStar: () => void; onClose: () => void; onTrade: (side: "buy" | "sell") => void;
}) {
  const live = /deploy|live|success/i.test(l.status) && !!l.symbol;
  const rows: [string, string][] = [
    ["Launchpad", l.launchpad ?? "—"],
    ["Creator", `@${l.xUsername}`],
    ["Status", l.status],
    ["Dev buy", l.devBuyLabel || "—"],
    ["Launched", new Date(l.createdAt).toLocaleString()],
  ];
  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-auto max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-surface-2 font-display text-lg text-primary">{(l.symbol ?? "?").slice(0, 3)}</div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-2xl">${l.symbol ?? "?"}</h2>
            <p className="truncate text-sm text-muted-foreground">{l.name}</p>
          </div>
          <button aria-label="Toggle watchlist" onClick={onStar}><Star className={`h-5 w-5 ${watching ? "fill-primary text-primary" : "text-muted-foreground"}`} /></button>
          <button aria-label="Close" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2">
          {rows.map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-surface p-2.5"><dt className="text-[0.65rem] uppercase text-muted-foreground">{k}</dt><dd className="truncate text-sm font-semibold">{v}</dd></div>
          ))}
        </dl>
        {l.tokenAddress && (
          <button onClick={() => copy(l.tokenAddress!)} className="mt-3 flex w-full items-center justify-between rounded-2xl bg-surface p-3 text-left">
            <span className="min-w-0"><span className="block text-[0.65rem] uppercase text-muted-foreground">Contract</span><span className="block truncate font-mono text-xs">{l.tokenAddress}</span></span>
            <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        )}
        {l.notice && <p className="mt-3 text-xs text-muted-foreground">{l.notice}</p>}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {l.tokenUrl && <a href={l.tokenUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full bg-surface px-3 py-1.5">Chart & token <ExternalLink className="h-3 w-3" /></a>}
          {l.txDigest && <a href={`https://suiscan.xyz/mainnet/tx/${l.txDigest}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full bg-surface px-3 py-1.5">Launch tx <ExternalLink className="h-3 w-3" /></a>}
          <a href={`https://x.com/i/status/${l.xPostId}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full bg-surface px-3 py-1.5">X post <ExternalLink className="h-3 w-3" /></a>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button disabled={!live} onClick={() => onTrade("buy")} className="rounded-full bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-40">Buy</button>
          <button disabled={!live} onClick={() => onTrade("sell")} className="rounded-full bg-surface-2 py-3 font-semibold disabled:opacity-40">Sell</button>
        </div>
        {!live && <p className="mt-2 text-center text-xs text-muted-foreground">Trading opens once this token is live.</p>}
      </div>
    </div>
  );
}

function copy(text: string) {
  navigator.clipboard?.writeText(text).then(() => toast.success("Copied"), () => toast.error("Couldn't copy"));
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 6 : 4 });

function AddressRow({ label, address, explorer, note }: { label: string; address: string | null; explorer?: string | undefined; note: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between text-xs font-semibold uppercase text-muted-foreground">
        <span>{label}</span>
        {address && explorer && <a href={explorer} target="_blank" rel="noreferrer" aria-label="Open in explorer"><ExternalLink className="h-4 w-4" /></a>}
      </div>
      {address ? (
        <button onClick={() => copy(address)} className="mt-1 flex w-full items-center gap-2 text-left font-mono text-xs">
          <span className="break-all">{address}</span><Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      ) : <p className="mt-1 text-xs text-muted-foreground">Not available yet.</p>}
      <p className="mt-1 text-[0.7rem] text-muted-foreground">{note}</p>
    </div>
  );
}

function WalletView({ initData, handle, onTrade }: { initData: string; handle: string; onTrade: () => void }) {
  const getWallet = useServerFn(tgGetBankWallet);
  const [w, setW] = useState<Awaited<ReturnType<typeof tgGetBankWallet>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    setErr(null);
    getWallet({ data: { initData } }).then(setW).catch((e) => setErr(String((e as Error).message ?? e)));
  }, [getWallet, initData]);
  useEffect(() => { load(); }, [load, handle]);

  if (err) return <p className="text-sm text-destructive">{err} <button className="underline" onClick={load}>Retry</button></p>;
  if (!w) return <p className="text-sm text-muted-foreground">Loading your OurBank wallet…</p>;
  if (!w.linked) return null;
  const chainRows = [
    ...w.sui.map((b) => ({ k: b.coinType, label: b.symbol, chain: "Sui", amount: b.amount })),
    ...(w.sol ? [{ k: "sol", label: "SOL", chain: "Solana", amount: w.sol.sol }, { k: "solusdc", label: "USDC", chain: "Solana", amount: w.sol.usdc }] : []),
    ...w.evm.flatMap((e) => [{ k: `${e.chain}-n`, label: e.native, chain: e.chain, amount: e.eth }, ...(e.usdc ? [{ k: `${e.chain}-u`, label: "USDC", chain: e.chain, amount: e.usdc }] : [])]),
  ].filter((r) => r.amount > 0);

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/30 via-surface to-cyber/20 p-4 shadow-glow">
        <img src={mascot.url} alt="" className="absolute -right-3 -bottom-3 h-28 w-28 object-contain" />
        <div className="text-xs font-semibold uppercase text-muted-foreground">OurBank · @{w.handle}</div>
        <div className="mt-1 font-display text-3xl">{chainRows.length} <span className="text-base text-muted-foreground">assets</span></div>
        <button className="mt-1 flex items-center gap-1 text-xs text-cyber" onClick={load}><RefreshCw className="h-3 w-3" />Refresh</button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {([
          ["Receive", ArrowDownToLine, () => document.getElementById("tg-addresses")?.scrollIntoView({ behavior: "smooth" })],
          ["Send", Send, onTrade],
          ["Swap", Repeat, onTrade],
        ] as const).map(([label, Icon, fn]) => (
          <button key={label} onClick={fn} className="flex flex-col items-center gap-1.5 text-xs font-semibold">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow"><Icon className="h-5 w-5" /></span>
            {label}
          </button>
        ))}
      </div>
      <div className="rounded-2xl border border-border bg-surface p-2">
        <div className="mb-1 rounded-xl bg-primary py-1.5 text-center text-sm font-semibold text-primary-foreground">Tokens</div>
        <ul>
          {chainRows.length === 0 && <li className="p-3 text-sm text-muted-foreground">No balances yet. Deposit to an address below.</li>}
          {chainRows.map((r) => (
            <li key={r.k} className="flex items-center gap-3 p-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 font-display text-xs text-cyber">{r.label.slice(0, 3)}</span>
              <span className="flex-1"><b className="text-sm">{r.label}</b><br /><span className="text-xs text-muted-foreground">{r.chain}</span></span>
              <span className="font-mono text-sm">{fmt(r.amount)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div id="tg-addresses" className="space-y-3">
        <AddressRow label="Sui wallet" address={w.address} explorer={`https://suiscan.xyz/mainnet/account/${w.address}`} note="Send SUI or any Sui token here." />
        <AddressRow label="EVM deposit (BNB, Base, Arbitrum)" address={w.evmAddress} note="Funds stay here until you ask the bot to bridge them." />
        <AddressRow label="Solana deposit (SOL, USDC)" address={w.solAddress} explorer={w.solAddress ? `https://solscan.io/account/${w.solAddress}` : undefined} note="Funds stay here until you ask the bot to bridge them." />
      </div>
    </div>
  );
}

const QUICK = ["balance", "buy 1 sui of $BLAST", "sell 50% $BLAST", "bridge 0.05 sol to sui", "bridge 10 sui to bnb"];

function linkify(text: string) {
  return text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noreferrer" className="break-all text-cyber underline">{part}</a>
      : <span key={i}>{part}</span>,
  );
}

type TradePreset = { side: "buy" | "sell"; token: string; key: number };

function SwapCard({ preset, busy, onRun }: { preset: TradePreset | null; busy: boolean; onRun: (cmd: string) => void }) {
  const [side, setSide] = useState<"buy" | "sell">(preset?.side ?? "buy");
  const [token, setToken] = useState(preset?.token ?? "BLAST");
  const [amount, setAmount] = useState(preset?.side === "sell" ? "50" : "1");
  const [review, setReview] = useState(false);
  useEffect(() => {
    if (!preset) return;
    setSide(preset.side); setToken(preset.token); setAmount(preset.side === "sell" ? "50" : "1"); setReview(false);
  }, [preset]);
  const cmd = buildTradeCommand(side, token, amount);
  const presets = side === "buy" ? ["0.5", "1", "5", "10"] : ["25", "50", "75", "100"];
  return (
    <div className="space-y-3 rounded-3xl border border-border bg-surface p-3">
      <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button key={s} onClick={() => { setSide(s); setAmount(s === "sell" ? "50" : "1"); setReview(false); }}
            className={`rounded-full py-2 text-sm font-semibold uppercase ${side === s ? (s === "buy" ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground") : "text-muted-foreground"}`}>{s}</button>
        ))}
      </div>
      <label className="block rounded-2xl border border-border bg-card p-3">
        <span className="text-[0.7rem] text-muted-foreground">Token</span>
        <div className="flex items-center gap-1 font-display text-xl"><span className="text-primary">$</span>
          <input value={token} onChange={(e) => { setToken(e.target.value.toUpperCase()); setReview(false); }} className="w-full bg-transparent outline-none" placeholder="BLAST" />
        </div>
      </label>
      <label className="block rounded-2xl border border-border bg-card p-3">
        <span className="text-[0.7rem] text-muted-foreground">{side === "buy" ? "Pay with SUI" : "Sell % of your balance"}</span>
        <div className="flex items-center gap-2 font-display text-xl">
          <input inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setReview(false); }} className="w-full bg-transparent outline-none" />
          <span className="text-sm text-muted-foreground">{side === "buy" ? "SUI" : "%"}</span>
        </div>
        <div className="mt-2 flex gap-1.5">
          {presets.map((p) => (
            <button key={p} type="button" onClick={() => { setAmount(p); setReview(false); }}
              className={`flex-1 rounded-full py-1 text-xs font-semibold ${amount === p ? "bg-primary/20 text-primary" : "bg-surface-2 text-muted-foreground"}`}>{side === "buy" ? p : p === "100" ? "MAX" : `${p}%`}</button>
          ))}
        </div>
      </label>
      {review && cmd ? (
        <div className="space-y-2 rounded-2xl border border-primary/40 bg-card p-3 text-sm">
          <p className="font-semibold">Review</p>
          <p className="text-muted-foreground">{side === "buy" ? `Spend ${amount} SUI from your OurBank wallet on $${token.replace(/^\$/, "")}.` : `Sell ${amount}% of your $${token.replace(/^\$/, "")} for SUI.`} Best route is picked when it runs; the final amount shows in the receipt.</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setReview(false)} className="rounded-full bg-surface-2 py-2 font-semibold">Back</button>
            <button disabled={busy} onClick={() => { setReview(false); onRun(cmd); }} className="rounded-full bg-primary py-2 font-semibold text-primary-foreground disabled:opacity-50">Confirm {side}</button>
          </div>
        </div>
      ) : (
        <button disabled={!cmd || busy} onClick={() => setReview(true)}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50">
          <Repeat className="h-4 w-4" />{cmd ? `Review ${side}` : "Enter a token and amount"}
        </button>
      )}
    </div>
  );
}

function TradeTerminal({ initData, preset }: { initData: string; preset: TradePreset | null }) {
  const run = useServerFn(tgRunCommand);
  const [log, setLog] = useState<{ id: string; who: "me" | "bot"; text: string }[]>([
    { id: "hi", who: "bot", text: "Use the swap card, or type any command below — it runs on your OurBank wallet." },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setDraft("");
    setBusy(true);
    setLog((l) => [...l, { id: crypto.randomUUID(), who: "me", text: t }]);
    try {
      const r = await run({ data: { initData, text: t } });
      setLog((l) => [...l, { id: crypto.randomUUID(), who: "bot", text: r.reply }]);
    } catch (e) {
      setLog((l) => [...l, { id: crypto.randomUUID(), who: "bot", text: `Nothing was sent: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3 pb-20">
      <SwapCard preset={preset} busy={busy} onRun={(c) => void send(c)} />
      <div className="space-y-2">
        {log.map((m) => (
          <div key={m.id} className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.who === "me" ? "ml-auto bg-primary text-primary-foreground" : "border border-border bg-card"}`}>
            {linkify(m.text)}
          </div>
        ))}
        {busy && <div className="w-fit rounded-2xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">Working…</div>}
      </div>
      <div className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom))] left-0 z-40 w-full border-t border-border bg-background/95 p-2 backdrop-blur">
        <div className="mx-auto max-w-md space-y-2">
          <div className="flex gap-2 overflow-x-auto">
            {QUICK.map((c) => (
              <button key={c} disabled={busy} onClick={() => setDraft(c)} className="shrink-0 rounded-full bg-surface px-3 py-1 text-xs font-semibold">{c}</button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void send(draft); }} className="flex gap-2">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="buy 1 sui of $BLAST"
              className="flex-1 rounded-full border border-border bg-surface px-4 py-2 text-sm outline-none" />
            <button disabled={busy || !draft.trim()} className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50" aria-label="Run">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const GUIDE: { tab: Tab; title: string; Icon: typeof Home; steps: string[] }[] = [
  { tab: "home", title: "Home", Icon: Home, steps: ["See the newest launches from @Ourblastbot.", "Tap a card to jump to launches, your watchlist, wallet or trading."] },
  { tab: "discover", title: "Discover", Icon: Search, steps: ["Search by ticker, creator or launchpad.", "Tap the star to add a token to your watchlist — you get a Telegram alert when it goes live or fails."] },
  { tab: "trade", title: "Trade", Icon: Zap, steps: ["Link your X account first (Wallet tab).", "Type a command or tap a quick button to fill it in, then press send.", "Nothing moves until you press send."] },
  { tab: "wallet", title: "Wallet", Icon: Wallet, steps: ["Connect X to open your OurBank wallet.", "Copy your Sui, EVM (BNB/Base/Arbitrum) or Solana address to deposit.", "Deposits stay on their chain until you tell the bot to bridge."] },
];

const CHEAT = [
  ["Balance", "balance"],
  ["Buy", "buy 1 sui of $BLAST"],
  ["Buy with SOL", "buy 0.03 sol of $BLAST"],
  ["Sell", "sell 50% $BLAST"],
  ["Send", "send 10 $BLAST to adeniyi.sui"],
  ["Multi-send", "send 22 $HOLMOT, 10 $BLAST & 20 $ONE to adeniyi.sui"],
  ["Bridge in", "bridge 0.05 sol to sui"],
  ["Bridge BNB", "bridge 0.02 bnb to sui"],
  ["Bridge out", "bridge 10 sui to bnb"],
  ["Claim fees", "claim fees for $TICKER"],
] as const;

const TROUBLE = [
  ["Can't see my wallet?", "Open the Wallet tab and tap Connect X. Use the same X account you use with @Ourblastbot — your OurBank wallet is tied to it. Close and reopen the app if it still looks empty."],
  ["Trade failed or \"couldn't read that\"?", "Check the command format in the list above (amount, coin, $TICKER). Make sure you hold enough of the coin plus a little SUI for gas. If it failed, nothing was sent — just try again."],
  ["Where is my transaction?", "Each reply includes an explorer link (Suiscan / Solscan). Bridges take a few minutes and can arrive in two steps. Type balance to see what has landed."],
] as const;

function GuideSheet({ onClose, onGo }: { onClose: () => void; onGo: (t: Tab) => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-auto max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl">HOW TO USE <span className="text-primary">OURBLAST</span></h2>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-2">
          {GUIDE.map(({ tab, title, Icon, steps }) => (
            <button key={tab} onClick={() => onGo(tab)} className="w-full rounded-2xl border border-border bg-surface p-3 text-left">
              <div className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4 text-primary" />{title}</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">{steps.map((s) => <li key={s}>{s}</li>)}</ul>
            </button>
          ))}
        </div>
        <h3 className="mt-4 mb-2 font-display text-lg">COMMANDS</h3>
        <p className="mb-2 text-xs text-muted-foreground">Type these in the Trade tab. Tap one to copy.</p>
        <ul className="space-y-1.5">
          {CHEAT.map(([label, cmd]) => (
            <li key={cmd}>
              <button onClick={() => copy(cmd)} className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left">
                <span className="w-20 shrink-0 text-[0.7rem] font-semibold uppercase text-muted-foreground">{label}</span>
                <code className="flex-1 break-all font-mono text-xs">{cmd}</code>
                <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
        <h3 className="mt-4 mb-2 font-display text-lg">TROUBLESHOOTING</h3>
        <div className="space-y-2">
          {TROUBLE.map(([q, a]) => (
            <div key={q} className="rounded-2xl border border-border bg-surface p-3">
              <div className="text-sm font-semibold">{q}</div>
              <p className="mt-1 text-xs text-muted-foreground">{a}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[0.7rem] text-muted-foreground">Launching a token? Tag @Ourblastbot on X or use the web Terminal. Full docs: ourblast.xyz/docs</p>
      </div>
    </div>
  );
}

function BlastPresales() {
  const fetchFeed = useServerFn(tgBlastPresales);
  const [feed, setFeed] = useState<Awaited<ReturnType<typeof tgBlastPresales>> | null>(null);
  useEffect(() => { fetchFeed().then(setFeed).catch(() => setFeed({ ok: false, reason: "unavailable", presales: [] })); }, [fetchFeed]);
  return (
    <div className="rounded-2xl border border-primary/40 bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-primary">Blast presales</span>
        <a href="https://blast.fun" target="_blank" rel="noreferrer" className="text-xs text-muted-foreground">blast.fun ↗</a>
      </div>
      {feed?.ok && feed.presales.length > 0 ? (
        <div className="mt-2 space-y-2">
          {feed.presales.slice(0, 8).map((p) => (
            <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl bg-surface p-2">
              {p.image ? <img src={p.image} alt="" className="h-9 w-9 rounded-lg object-cover" /> : <div className="h-9 w-9 rounded-lg bg-muted" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{p.symbol ? `$${p.symbol}` : p.name ?? "Presale"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[p.status, p.raised && p.target ? `${p.raised} / ${p.target} SUI` : null].filter(Boolean).join(" · ") || "Open on blast.fun"}
                </p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </a>
          ))}
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm font-semibold">{feed === null ? "Loading presales…" : "Join Sui presales on blast.fun"}</p>
          <p className="mt-1 text-xs text-muted-foreground">Commit SUI to fixed-term sales. If a raise misses its target, commitments are refunded; if it fills, liquidity opens on Cetus or Bluefin.</p>
        </>
      )}
    </div>
  );
}
