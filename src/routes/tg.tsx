// SPDX-License-Identifier: BUSL-1.1
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownToLine, ArrowDownUp, Copy, ExternalLink, HelpCircle, Home, Image as ImageIcon, RefreshCw, Repeat, Rocket, Search, Send, Star, Wallet, X, Zap } from "lucide-react";
import logo from "@/assets/blast-logo.jpg.asset.json";
import mascot from "@/assets/blast-cool.png.asset.json";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TgNftPanel } from "@/components/tg/TgNftPanel";

import { buildSwapCommand, normalizeSwapToken, swapTokenSymbol } from "@/lib/tg/tradeCommand";
import { MAIN_TOKENS, mainTokenByType } from "@/lib/terminal/mainTokens";
import { listPublicLaunches } from "@/lib/terminal/launch-status.functions";
import { tgBlastPresales, tgBridgeHistory, tgConsolidate, tgCreateWallet, tgExportWalletKey, tgWalletTokens, tgWalletTransfer, tgGetBankWallet, tgListWallets, tgSetTradeSlots, tgLinkX, tgRunCommand, tgSession, tgToggleWatch, tgUnlinkX } from "@/lib/tg/tg.functions";

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
    // Bot chat "Link X" button opens /tg?tab=wallet.
    const want = new URLSearchParams(window.location.search).get("tab");
    if (want === "wallet" || want === "trade" || want === "discover" || want === "assets") setTab(want as Tab);
  }, []);

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
          <h2 className="font-display text-lg">DASHBOARD</h2>
          <div className="grid grid-cols-4 gap-2">
            {([
              ["Buy", Zap, "text-primary", () => { setPreset({ side: "buy", token: "", key: Date.now(), mode: "swap" }); setTab("trade"); }],
              ["Sell", ArrowDownUp, "text-grape", () => { setPreset({ side: "sell", token: "", key: Date.now(), mode: "swap" }); setTab("trade"); }],
              ["Snipe", Rocket, "text-lime", () => { setPreset({ side: "buy", token: "", key: Date.now(), mode: "snipe" }); setTab("trade"); }],
              ["Copy", Repeat, "text-cyber", () => { setPreset({ side: "buy", token: "", key: Date.now(), mode: "copy" }); setTab("trade"); }],
              ["Limit", RefreshCw, "text-muted-foreground", () => { setPreset({ side: "buy", token: "", key: Date.now(), mode: "limit" }); setTab("trade"); }],
              ["Wallet", Wallet, "text-cyber", () => setTab("wallet")],
              ["Assets", ImageIcon, "text-grape", () => setTab("assets")],
              ["Deposit", ArrowDownToLine, "text-lime", () => setTab("wallet")],
              ["Launches", Search, "text-primary", () => { setFilter("live"); setTab("discover"); }],
              [`Watch (${watch.size})`, Star, "text-lime", () => { setFilter("watch"); setTab("discover"); }],
              ["Presales", Send, "text-grape", () => { setFilter("live"); setTab("discover"); }],
              ["Guide", HelpCircle, "text-primary", () => setHelp(true)],
              ["Terminal", Copy, "text-muted-foreground", () => { setPreset({ side: "buy", token: "", key: Date.now(), mode: "swap" }); setTab("trade"); }],
            ] as const).map(([label, Icon, tone, go]) => (
              <button key={label} onClick={go}
                className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-surface px-1 py-3 active:scale-95 transition-transform">
                <Icon className={`h-6 w-6 ${tone}`} />
                <span className="truncate text-[0.65rem] font-semibold">{label}</span>
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
          onTrade={(side) => { setPreset({ side, token: open.tokenAddress ?? open.symbol ?? "", key: Date.now() }); setOpenId(null); setTab("trade"); }} />
      )}

      {tab === "trade" && (
        session?.xUsername && initData
          ? <TradeTerminal initData={initData} preset={preset} />
          : <div className="space-y-3"><p className="text-sm text-muted-foreground">Link your X account to trade from your OurBank wallet.</p>{xCard}</div>
      )}

      {tab === "wallet" && (
        <div className="space-y-3">
          {xCard}
          {session?.xUsername && initData && <WalletView initData={initData} handle={session.xUsername} onTrade={() => setTab("trade")}
            onSell={(token, amount) => { setPreset({ side: "sell", token, amount, key: Date.now() }); setTab("trade"); }} />}
        </div>
      )}

      {tab === "assets" && (
        <div className="space-y-3">
          <div>
            <h2 className="font-display text-2xl uppercase">Assets</h2>
            <p className="text-sm text-muted-foreground">NFTs in your main OurBank Sui wallet, including kiosk items.</p>
          </div>
          {session?.xUsername && initData
            ? <TgNftPanel key={session.xUsername} initData={initData} handle={session.xUsername} />
            : <div className="space-y-3"><p className="text-sm text-muted-foreground">Link your X account to see your NFTs.</p>{xCard}</div>}
        </div>
      )}

      <nav className="fixed bottom-0 left-0 z-50 w-full border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {([["home", "Home", Home], ["discover", "Discover", Search], ["trade", "Trade", Zap], ["assets", "Assets", ImageIcon], ["wallet", "Wallet", Wallet]] as const).map(([t, label, Icon]) => (
            <button key={t} onClick={() => setTab(t)} className={`flex flex-col items-center gap-0.5 py-2 text-[0.65rem] font-semibold uppercase ${tab === t ? "text-primary" : "text-muted-foreground"}`}>
              <Icon className="h-5 w-5" />{label}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}

type Tab = "home" | "discover" | "trade" | "assets" | "wallet";

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

function WalletView({ initData, handle, onTrade, onSell }: { initData: string; handle: string; onTrade: () => void; onSell: (token: string, pct: string) => void }) {
  const getWallet = useServerFn(tgGetBankWallet);
  const [w, setW] = useState<Awaited<ReturnType<typeof tgGetBankWallet>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [inventoryTab, setInventoryTab] = useState<"tokens" | "nfts">("tokens");
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
      <WalletManager initData={initData} />
      <BridgeHistory initData={initData} />
      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Wallet inventory">
        <Button role="tab" aria-selected={inventoryTab === "tokens"} variant={inventoryTab === "tokens" ? "default" : "outline"} onClick={() => setInventoryTab("tokens")}>Tokens</Button>
        <Button role="tab" aria-selected={inventoryTab === "nfts"} variant={inventoryTab === "nfts" ? "default" : "outline"} onClick={() => setInventoryTab("nfts")}>NFTs</Button>
      </div>
      {inventoryTab === "nfts" ? <TgNftPanel key={handle} initData={initData} handle={handle} /> : <>
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
      {(() => {
        const positions = w.sui.filter((b) => b.amount > 0 && !/^0x0*2::sui::SUI$/i.test(b.coinType));
        const total = w.sui.reduce((t, b) => t + (b.usd ?? 0), 0);
        return (
          <div className="rounded-2xl border border-border bg-surface p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <b className="font-display text-lg">Positions</b>
              {total > 0 && <span className="text-xs text-muted-foreground">Sui total ≈ ${total.toFixed(2)}</span>}
            </div>
            {positions.length === 0 && <p className="text-sm text-muted-foreground">No Sui token positions yet.</p>}
            <ul className="space-y-2">
              {positions.map((p) => (
                <li key={p.coinType} className="rounded-xl bg-card p-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <b>${p.symbol}</b>
                    <span className="font-mono">{fmt(p.amount)}{p.usd != null && <span className="ml-1 text-muted-foreground">≈ ${p.usd.toFixed(2)}</span>}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {["25", "50", "100"].map((pct) => (
                      <button key={pct} onClick={() => onSell(p.coinType, pct)} className="rounded-full bg-surface-2 py-1 text-xs font-semibold">{pct === "100" ? "Sell MAX" : `Sell ${pct}%`}</button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[0.7rem] text-muted-foreground">Values from Aftermath when a price exists. Profit/loss needs your buy prices, which aren't tracked yet. Sell buttons open a review first.</p>
          </div>
        );
      })()}
      </>}
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

type TradeMode = "swap" | "snipe" | "limit" | "copy";
type TradePreset = { side: "buy" | "sell"; token: string; key: number; amount?: string; mode?: TradeMode };

type Holding = { coinType: string; symbol: string; amount: number; usd: number | null };

function SwapCard({ preset, busy, onRun, holdings, onRefresh }: { preset: TradePreset | null; busy: boolean; onRun: (cmd: string) => void; holdings: Holding[]; onRefresh: () => void }) {
  const [pay, setPay] = useState("SUI");
  const [receive, setReceive] = useState("BLAST");
  const [amount, setAmount] = useState("");
  const [isMax, setIsMax] = useState(false);
  const [review, setReview] = useState(false);
  const [picking, setPicking] = useState<"pay" | "receive" | null>(null);
  const [search, setSearch] = useState("");
  const bal = (sym: string) => holdings.find((h) => h.coinType === sym) ?? holdings.find((h) => !sym.includes("::") && h.symbol.toUpperCase() === sym.toUpperCase());
  const unitUsd = (sym: string) => { const h = bal(sym); return h && h.usd != null && h.amount > 0 ? h.usd / h.amount : null; };

  useEffect(() => {
    if (!preset) return;
    const t = normalizeSwapToken(preset.token);
    setReview(false); setIsMax(false);
    if (preset.side === "buy") { setPay("SUI"); setReceive(t); setAmount(preset.amount ?? "1"); return; }
    setPay(t); setReceive("SUI");
    const pct = Number(preset.amount ?? "50");
    if (pct >= 100) { setIsMax(true); setAmount(String(bal(t)?.amount ?? "")); }
    else { const b = bal(t)?.amount; setAmount(b ? String(+(b * pct / 100).toPrecision(6)) : ""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const flip = () => { setPay(receive); setReceive(pay); setAmount(""); setIsMax(false); setReview(false); };
  const choose = (sym: string) => {
    const s = normalizeSwapToken(sym);
    if (!s) return;
    if (picking === "pay") { if (s === receive) setReceive(pay); setPay(s); if (s !== "SUI" && receive !== "SUI" && s !== receive) setReceive("SUI"); }
    if (picking === "receive") { if (s === pay) setPay(receive); setReceive(s); if (s !== "SUI" && pay !== "SUI" && s !== pay) setPay("SUI"); }
    setPicking(null); setSearch(""); setAmount(""); setIsMax(false); setReview(false);
  };
  const payBal = bal(pay)?.amount ?? 0;
  const maxAmount = pay === "SUI" ? Math.max(0, payBal - 0.2) : payBal;
  const cmd = buildSwapCommand(bal(pay)?.coinType && pay !== "SUI" ? bal(pay)?.coinType ?? pay : pay, bal(receive)?.coinType && receive !== "SUI" ? bal(receive)?.coinType ?? receive : receive, isMax && pay !== "SUI" ? "all" : amount);
  const over = Number(amount) > payBal + 1e-12;
  const payUsd = unitUsd(pay);
  const estOut = (() => { const a = Number(amount), up = unitUsd(pay), ur = unitUsd(receive); return a > 0 && up && ur ? (a * up) / ur : null; })();
  const pickList = useMemo(() => {
    const syms = Array.from(new Set(["SUI", ...MAIN_TOKENS.map((t) => t.symbol), ...holdings.filter((h) => h.symbol.toUpperCase() !== "SUI" && !mainTokenByType(h.coinType)).map((h) => h.coinType)]));
    const q = search.trim().replace(/^\$/, "").toUpperCase();
    return syms.filter((s) => !q || swapTokenSymbol(s).toUpperCase().includes(q) || s.toUpperCase().includes(q));
  }, [holdings, search]);

  const TokenBtn = ({ sym, side }: { sym: string; side: "pay" | "receive" }) => (
    <button type="button" onClick={() => setPicking(side)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-1 pr-2.5 text-sm font-semibold">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/20 font-display text-[0.6rem] text-primary">{swapTokenSymbol(sym).slice(0, 3)}</span>
      {swapTokenSymbol(sym)}<span className="text-muted-foreground">▾</span>
    </button>
  );

  return (
    <div className="relative space-y-1 rounded-3xl border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <b className="font-display text-lg">Swap</b>
        <button onClick={onRefresh} className="flex items-center gap-1 text-xs text-cyber"><RefreshCw className="h-3 w-3" />Balances</button>
      </div>
      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="flex items-center justify-between text-[0.7rem] text-muted-foreground">
          <span>You pay</span>
          <span>Balance {fmt(payBal)}
            {maxAmount > 0 && <button className="ml-2 rounded-full bg-primary/20 px-2 font-semibold text-primary" onClick={() => { setAmount(String(+maxAmount.toPrecision(8))); setIsMax(pay !== "SUI"); setReview(false); }}>MAX</button>}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <input inputMode="decimal" placeholder="0" value={amount} onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, "")); setIsMax(false); setReview(false); }}
            className="w-full min-w-0 bg-transparent font-display text-3xl outline-none" />
          <TokenBtn sym={pay} side="pay" />
        </div>
        <div className="mt-1 h-4 text-[0.7rem] text-muted-foreground">{payUsd && Number(amount) > 0 ? `≈ $${(payUsd * Number(amount)).toFixed(2)}` : ""}</div>
      </div>
      <div className="relative z-10 -my-3 flex justify-center">
        <button onClick={flip} aria-label="Flip" className="grid h-9 w-9 place-items-center rounded-full border-4 border-surface bg-primary text-primary-foreground"><ArrowDownUp className="h-4 w-4" /></button>
      </div>
      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="flex items-center justify-between text-[0.7rem] text-muted-foreground">
          <span>You receive</span><span>Balance {fmt(bal(receive)?.amount ?? 0)}</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <div className="w-full min-w-0 truncate font-display text-3xl text-muted-foreground">{estOut != null ? `~${fmt(estOut)}` : "—"}</div>
          <TokenBtn sym={receive} side="receive" />
        </div>
        <div className="mt-1 text-[0.7rem] text-muted-foreground">{estOut != null ? "Estimate from Aftermath prices; final amount in the receipt." : "Best route is picked when it runs; final amount in the receipt."}</div>
      </div>

      {review && cmd ? (
        <div className="mt-2 space-y-2 rounded-2xl border border-primary/40 bg-card p-3 text-sm">
          <p className="font-semibold">Review swap</p>
          <p className="text-muted-foreground">Pay {isMax && pay !== "SUI" ? `all your ${swapTokenSymbol(pay)}` : `${amount} ${swapTokenSymbol(pay)}`} from your OurBank wallet for {swapTokenSymbol(receive)}. Nothing moves until you confirm.</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setReview(false)} className="rounded-full bg-surface-2 py-2 font-semibold">Back</button>
            <button disabled={busy} onClick={() => { setReview(false); onRun(cmd); setAmount(""); setIsMax(false); }} className="rounded-full bg-primary py-2 font-semibold text-primary-foreground disabled:opacity-50">Confirm swap</button>
          </div>
        </div>
      ) : (
        <button disabled={!cmd || busy || over} onClick={() => setReview(true)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50">
          <Repeat className="h-4 w-4" />{over ? `Not enough ${swapTokenSymbol(pay)}` : cmd ? "Review swap" : "Enter an amount"}
        </button>
      )}

      {picking && (
        <div className="absolute inset-0 z-20 flex flex-col rounded-3xl bg-surface p-3">
          <div className="mb-2 flex items-center justify-between">
            <b className="font-display text-lg">Select token</b>
            <button onClick={() => { setPicking(null); setSearch(""); }} aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ticker or paste contract"
            onKeyDown={(e) => { if (e.key === "Enter") choose(search); }}
            className="mb-2 rounded-full border border-border bg-card px-4 py-2 text-sm outline-none" />
          <ul className="flex-1 overflow-y-auto">
            {pickList.map((s) => (
              <li key={s}>
                <button onClick={() => choose(s)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-card">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 font-display text-[0.6rem] text-cyber">{swapTokenSymbol(s).slice(0, 3)}</span>
                  <b className="flex-1 text-sm">{swapTokenSymbol(s)}</b>
                  <span className="font-mono text-xs text-muted-foreground">{fmt(bal(s)?.amount ?? 0)}</span>
                </button>
              </li>
            ))}
            {search.trim() && !pickList.includes(search.trim().replace(/^\$/, "").toUpperCase()) && (
              <li><button onClick={() => choose(search)} className="w-full rounded-xl p-2 text-left text-sm text-primary">Use {swapTokenSymbol(normalizeSwapToken(search))}</button></li>
            )}
          </ul>
          <p className="text-[0.7rem] text-muted-foreground">Swaps go between SUI and a Sui token.</p>
        </div>
      )}
    </div>
  );
}

function SoonCard({ title, text, soon = true }: { title: string; text: string; soon?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="font-display text-lg uppercase">{title} {soon && <span className="ml-1 rounded-full bg-surface px-2 py-0.5 text-[10px] text-muted-foreground">soon</span>}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

const CA_RE = /^0x[a-f0-9]{1,64}::[a-z_][a-z0-9_]*::[a-z_][a-z0-9_]*$/i;
function SnipeCard({ busy, onRun }: { busy: boolean; onRun: (cmd: string) => void }) {
  const [ca, setCa] = useState("");
  const [amount, setAmount] = useState("1");
  const [slip, setSlip] = useState("10");
  const [review, setReview] = useState(false);
  const caOk = CA_RE.test(ca.trim());
  const amtOk = Number(amount) > 0 && Number(amount) <= 1000;
  const slipOk = Number(slip) >= 0.1 && Number(slip) <= 50;
  const ok = caOk && amtOk && slipOk;
  const cmd = `buy ${amount} sui of ${ca.trim()} slippage ${slip}%`;
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <p className="font-display text-lg uppercase">Snipe a launch</p>
      <input value={ca} onChange={(e) => { setCa(e.target.value); setReview(false); }} placeholder="0x…::coin::COIN (contract only)"
        className="w-full rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs outline-none" />
      {ca && !caOk && <p className="text-xs text-destructive">Paste the full contract — tickers can be faked by new launches.</p>}
      <div className="flex gap-2">
        {["1", "5", "10"].map((a) => (
          <button key={a} onClick={() => { setAmount(a); setReview(false); }} className={`flex-1 rounded-full py-1.5 text-xs font-bold ${amount === a ? "bg-primary text-primary-foreground" : "bg-surface"}`}>{a} SUI</button>
        ))}
        <input value={amount} onChange={(e) => { setAmount(e.target.value); setReview(false); }} inputMode="decimal" className="w-16 rounded-full border border-border bg-surface px-2 text-center text-xs outline-none" />
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Max slippage</span>
        {["5", "10", "20"].map((s) => (
          <button key={s} onClick={() => { setSlip(s); setReview(false); }} className={`rounded-full px-3 py-1 font-bold ${slip === s ? "bg-primary text-primary-foreground" : "bg-surface"}`}>{s}%</button>
        ))}
        <input value={slip} onChange={(e) => { setSlip(e.target.value); setReview(false); }} inputMode="decimal" className="w-12 rounded-full border border-border bg-surface px-2 py-1 text-center outline-none" />
      </div>
      {review && ok ? (
        <div className="space-y-2 rounded-xl bg-surface p-3 text-xs">
          <p>Spend <b>{amount} SUI</b> · max slippage <b>{slip}%</b></p>
          <p className="break-all font-mono">{ca.trim()}</p>
          <p className="text-muted-foreground">If you'd get less than your limit allows, the trade fails and only gas is spent.</p>
          <div className="flex gap-2">
            <button onClick={() => setReview(false)} className="flex-1 rounded-full bg-background py-2 font-bold">Cancel</button>
            <button disabled={busy} onClick={() => { setReview(false); onRun(cmd); }} className="flex-1 rounded-full bg-primary py-2 font-bold text-primary-foreground disabled:opacity-50">Confirm snipe</button>
          </div>
        </div>
      ) : (
        <button disabled={!ok || busy} onClick={() => setReview(true)} className="w-full rounded-full bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">Review snipe</button>
      )}
    </div>
  );
}

function LimitCard({ busy, onRun }: { busy: boolean; onRun: (cmd: string) => void }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [ca, setCa] = useState("");
  const [amount, setAmount] = useState("5");
  const [price, setPrice] = useState("");
  const [slip, setSlip] = useState("5");
  const [review, setReview] = useState(false);
  const caOk = CA_RE.test(ca.trim());
  const amtOk = Number(amount) > 0 && (side === "buy" ? Number(amount) <= 1000 : Number(amount) <= 100);
  const ok = caOk && amtOk && Number(price) > 0 && Number(slip) >= 0.1 && Number(slip) <= 50;
  const body = `${side === "buy" ? `buy ${amount} sui of` : `sell ${amount}%`} ${ca.trim()} at ${price} slippage ${slip}%`;
  const reset = () => setReview(false);
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <p className="font-display text-lg uppercase">Limit order</p>
      <div className="grid grid-cols-2 gap-1 rounded-full bg-surface p-1">
        {(["buy", "sell"] as const).map((x) => (
          <button key={x} onClick={() => { setSide(x); setAmount(x === "buy" ? "5" : "50"); reset(); }} className={`rounded-full py-1.5 text-xs font-bold uppercase ${side === x ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{x === "buy" ? "Buy the dip" : "Take profit"}</button>
        ))}
      </div>
      <input value={ca} onChange={(e) => { setCa(e.target.value); reset(); }} placeholder="0x…::coin::COIN (contract only)" className="w-full rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs outline-none" />
      {ca && !caOk && <p className="text-xs text-destructive">Paste the full contract.</p>}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="space-y-1"><span className="text-muted-foreground">{side === "buy" ? "Spend (SUI)" : "Sell (%)"}</span>
          <input value={amount} onChange={(e) => { setAmount(e.target.value); reset(); }} inputMode="decimal" className="w-full rounded-xl border border-border bg-surface px-3 py-2 outline-none" /></label>
        <label className="space-y-1"><span className="text-muted-foreground">{side === "buy" ? "When price ≤ (USD)" : "When price ≥ (USD)"}</span>
          <input value={price} onChange={(e) => { setPrice(e.target.value); reset(); }} inputMode="decimal" placeholder="0.0012" className="w-full rounded-xl border border-border bg-surface px-3 py-2 outline-none" /></label>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Max slippage</span>
        {["5", "10", "20"].map((x) => (
          <button key={x} onClick={() => { setSlip(x); reset(); }} className={`rounded-full px-3 py-1 font-bold ${slip === x ? "bg-primary text-primary-foreground" : "bg-surface"}`}>{x}%</button>
        ))}
      </div>
      {review && ok ? (
        <div className="space-y-2 rounded-xl bg-surface p-3 text-xs">
          <p>{side === "buy" ? <>Buy <b>{amount} SUI</b> when price ≤ <b>${price}</b></> : <>Sell <b>{amount}%</b> when price ≥ <b>${price}</b></>} · slippage {slip}%</p>
          <p className="break-all font-mono">{ca.trim()}</p>
          <p className="text-muted-foreground">Runs automatically from your selected wallet(s) when the live price hits. Expires in 7 days. Cancel anytime: orders.</p>
          <div className="flex gap-2">
            <button onClick={reset} className="flex-1 rounded-full bg-background py-2 font-bold">Cancel</button>
            <button disabled={busy} onClick={() => { reset(); onRun(`place limit ${body}`); }} className="flex-1 rounded-full bg-primary py-2 font-bold text-primary-foreground disabled:opacity-50">Place order</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button disabled={!ok || busy} onClick={() => { setReview(true); onRun(`limit ${body}`); }} className="flex-1 rounded-full bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">Review order</button>
          <button disabled={busy} onClick={() => onRun("orders")} className="rounded-full bg-surface px-4 text-sm font-bold">My orders</button>
        </div>
      )}
    </div>
  );
}

function WalletStrip({ busy, onRun }: { busy: boolean; onRun: (cmd: string) => void }) {
  const [pick, setPick] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 text-xs">
      <span className="font-bold">Trade from</span>
      <button disabled={busy} onClick={() => onRun("wallets")} className="rounded-full bg-surface px-3 py-1 font-bold">My wallets</button>
      <input value={pick} onChange={(e) => setPick(e.target.value)} placeholder="1,2 or all" className="w-20 rounded-full border border-border bg-surface px-2 py-1 text-center outline-none" />
      <button disabled={busy || !pick.trim()} onClick={() => { onRun(`use ${pick.trim()}`); setPick(""); }} className="rounded-full bg-primary px-3 py-1 font-bold text-primary-foreground disabled:opacity-50">Use</button>
      <button disabled={busy} onClick={() => onRun("newwallet")} className="rounded-full bg-surface px-3 py-1 font-bold">+ New</button>
    </div>
  );
}

function TradeTerminal({ initData, preset }: { initData: string; preset: TradePreset | null }) {
  const run = useServerFn(tgRunCommand);
  const getWallet = useServerFn(tgGetBankWallet);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const loadHoldings = useCallback(() => {
    getWallet({ data: { initData } }).then((w) => setHoldings(w.linked ? w.sui.map((b) => ({ ...b, symbol: /^0x0*2::sui::SUI$/i.test(b.coinType) ? "SUI" : b.symbol })) : [])).catch(() => {});
  }, [getWallet, initData]);
  useEffect(() => { loadHoldings(); }, [loadHoldings]);
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
      loadHoldings();
    } catch (e) {
      setLog((l) => [...l, { id: crypto.randomUUID(), who: "bot", text: `Nothing was sent: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };
  const [mode, setMode] = useState<TradeMode>(preset?.mode ?? "swap");
  useEffect(() => { if (preset?.mode) setMode(preset.mode); }, [preset?.key, preset?.mode]);
  return (
    <div className="flex flex-col gap-3 pb-20">
      <div className="grid grid-cols-4 gap-1 rounded-full bg-surface p-1">
        {(["swap", "snipe", "limit", "copy"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`rounded-full py-1.5 text-xs font-bold uppercase ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{m}</button>
        ))}
      </div>
      <WalletStrip busy={busy} onRun={(c) => void send(c)} />
      {mode === "swap" && <SwapCard preset={preset} busy={busy} onRun={(c) => void send(c)} holdings={holdings} onRefresh={loadHoldings} />}
      {mode === "snipe" && <SnipeCard busy={busy} onRun={(c) => void send(c)} />}
      {mode === "limit" && <LimitCard busy={busy} onRun={(c) => void send(c)} />}
      {mode === "copy" && <SoonCard soon={false} title="Copy trading" text="Copy a wallet's buys and sells with a per-trade size and daily max. In the bot chat send “copy 0x… 2 sui max 10 sui” — review, confirm, and stop anytime with “stopcopy all”." />}
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

function WalletManager({ initData }: { initData: string }) {
  const list = useServerFn(tgListWallets);
  const create = useServerFn(tgCreateWallet);
  const setSlots = useServerFn(tgSetTradeSlots);
  const exportKey = useServerFn(tgExportWalletKey);
  const [bk, setBk] = useState<{ slot: number; ack: boolean; key: string | null; left: number } | null>(null);
  useEffect(() => {
    if (!bk?.key) return;
    if (bk.left <= 0) { setBk(null); void navigator.clipboard.writeText("").catch(() => {}); return; }
    const t = setTimeout(() => setBk((b) => (b ? { ...b, left: b.left - 1 } : b)), 1000);
    return () => clearTimeout(t);
  }, [bk]);
  const [d, setD] = useState<Awaited<ReturnType<typeof tgListWallets>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<"wallets" | "move" | "withdraw" | "merge">("wallets");
  const load = useCallback(() => { list({ data: { initData } }).then(setD).catch((e) => setMsg((e as Error).message)); }, [list, initData]);
  useEffect(() => { load(); }, [load]);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg(ok); load(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const toggle = (slot: number) => {
    if (!d) return;
    const next = d.selected.includes(slot) ? d.selected.filter((s) => s !== slot) : [...d.selected, slot].sort();
    if (!next.length) { setMsg("At least one wallet must stay selected."); return; }
    void act(() => setSlots({ data: { initData, slots: next } }), "Trade wallets saved.");
  };
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="mb-1 flex items-baseline justify-between">
        <b className="font-display text-lg">Sui wallets</b>
        <span className="text-xs text-muted-foreground">{d ? `${d.wallets.length}/6` : "…"}</span>
      </div>
      <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-card p-1 text-xs font-semibold">
        {(["wallets", "move", "withdraw", "merge"] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); setMsg(null); }} className={`rounded-lg py-1.5 ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            {t === "wallets" ? "Wallets" : t === "move" ? "Distribute" : t === "withdraw" ? "Withdraw" : "Consolidate"}
          </button>
        ))}
      </div>
      {tab !== "wallets" && d && <MoveFunds initData={initData} mode={tab} wallets={d.wallets} onDone={load} />}
      {tab === "wallets" && <>
      <p className="mb-2 text-xs text-muted-foreground">Tap to choose which wallets trades run from. Buys spend the amount from each selected wallet.</p>
      <ul className="space-y-2">
        {d?.wallets.map((w) => {
          const on = d.selected.includes(w.slot);
          return (
            <li key={w.slot} className={`rounded-xl border p-2.5 ${on ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
              <button disabled={busy} onClick={() => toggle(w.slot)} className="flex w-full items-center justify-between text-left text-sm">
                <span><b>w{w.slot} · {w.label}</b>{on && <span className="ml-2 text-xs text-primary">trading</span>}</span>
                <span className="font-mono">{w.sui == null ? "?" : fmt(w.sui)} SUI</span>
              </button>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate font-mono">{w.address}</span>
                <button aria-label="Copy address" onClick={() => { void navigator.clipboard.writeText(w.address); setMsg(`w${w.slot} address copied.`); }}><Copy className="h-3.5 w-3.5" /></button>
                <button onClick={() => setBk({ slot: w.slot, ack: false, key: null, left: 0 })} className="ml-auto shrink-0 rounded-lg border border-border px-2 py-0.5 text-foreground">Backup</button>
              </div>
            </li>
          );
        })}
      </ul>
      {d && d.wallets.length < 6 && (
        <div className="mt-3 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="Name (e.g. sniper)" className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm" />
          <button disabled={busy} onClick={() => act(() => create({ data: { initData, label: name || null } }).then(() => setName("")), "New wallet created. Send SUI to its address to fund it.")} className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Add wallet</button>
        </div>
      )}
      </>}
      {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}
      {bk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4" onClick={() => setBk(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-4 text-sm" onClick={(e) => e.stopPropagation()}>
            <b className="font-display text-lg">Back up wallet w{bk.slot}</b>
            <p className="mt-1 text-xs text-muted-foreground">Import this key into Slush, Suiet or any Sui wallet. Anyone with it controls this wallet. Never share it — not even with OURBLAST support.</p>
            {bk.key ? (
              <>
                <p className="mt-3 break-all rounded-lg border border-border bg-card p-2 font-mono text-xs">{bk.key}</p>
                <p className="mt-1 text-xs text-muted-foreground">Hides in {bk.left}s.</p>
                <button onClick={() => { void navigator.clipboard.writeText(bk.key!); setMsg("Key copied — clipboard clears when it hides."); }} className="mt-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Copy key</button>
              </>
            ) : (
              <>
                <label className="mt-3 flex items-start gap-2 text-xs">
                  <input type="checkbox" checked={bk.ack} onChange={(e) => setBk({ ...bk, ack: e.target.checked })} />
                  I understand anyone with this key can take the funds.
                </label>
                <button disabled={!bk.ack || busy} onClick={async () => {
                  setBusy(true);
                  try { const r = await exportKey({ data: { initData, slot: bk.slot } }); setBk({ ...bk, key: r.secretKey, left: 60 }); }
                  catch (e) { setMsg((e as Error).message); setBk(null); }
                  finally { setBusy(false); }
                }} className="mt-3 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Revealing…" : "Reveal key"}</button>
              </>
            )}
            <button onClick={() => setBk(null)} className="ml-2 mt-3 rounded-xl border border-border px-3 py-2 text-sm">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

type WRow = { slot: number; label: string; address: string; sui: number | null };
type Tok = { coinType: string; symbol: string; amount: number };

function MoveFunds({ initData, mode, wallets, onDone }: { initData: string; mode: "move" | "withdraw" | "merge"; wallets: WRow[]; onDone: () => void }) {
  const getTokens = useServerFn(tgWalletTokens);
  const transfer = useServerFn(tgWalletTransfer);
  const consolidate = useServerFn(tgConsolidate);
  const [from, setFrom] = useState(1);
  const [toks, setToks] = useState<Tok[] | null>(null);
  const [coin, setCoin] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [targets, setTargets] = useState<number[]>([]);
  const [addr, setAddr] = useState("");
  const [only, setOnly] = useState<"sui" | "all">("all");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ ok: boolean; text: string; digest?: string | undefined }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setReview(false); setOut(null); setErr(null); }, [mode]);
  useEffect(() => {
    if (mode === "merge") return;
    setToks(null); setCoin("");
    getTokens({ data: { initData, slot: from } }).then((r) => { setToks(r.tokens); setCoin(r.tokens[0]?.coinType ?? ""); }).catch((e) => setErr((e as Error).message));
  }, [from, mode, initData, getTokens]);
  const tok = toks?.find((t) => t.coinType === coin);
  const validAddr = /^0x[0-9a-fA-F]{1,64}$/.test(addr.trim());
  const canReview = mode === "merge" ? wallets.length > 1 : !!tok && (amount === "max" || Number(amount) > 0) && (mode === "move" ? targets.length > 0 : validAddr) && !(amount === "max" && mode === "move" && targets.length > 1);
  const chip = (on: boolean) => `rounded-lg border px-2.5 py-1 text-xs ${on ? "border-primary bg-primary/15 text-primary" : "border-border bg-card"}`;
  const run = async () => {
    setBusy(true); setErr(null);
    try {
      if (mode === "merge") {
        const r = await consolidate({ data: { initData, toSlot: from, only } });
        setOut(r.results.length ? r.results.map((x) => ({ ok: x.ok, text: `${x.from} → ${r.to} · ${x.symbol}${x.ok ? "" : ` — ${x.error}`}`, digest: x.digest })) : [{ ok: true, text: "Nothing to move — the other wallets are empty." }]);
      } else {
        const r = await transfer({ data: { initData, fromSlot: from, coinType: coin, amount: amount.trim(), toSlots: mode === "move" ? targets : [], toAddress: mode === "withdraw" ? addr.trim() : null } });
        setOut(r.results.map((x) => ({ ok: x.ok, text: `${amount === "max" ? "All" : amount} ${r.symbol} → ${x.to}${x.ok ? "" : ` — ${x.error}`}`, digest: x.digest })));
      }
      setReview(false); onDone();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const wname = (s: number) => { const w = wallets.find((x) => x.slot === s); return w ? `w${s} · ${w.label}` : `w${s}`; };
  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="mb-1 text-xs text-muted-foreground">{mode === "merge" ? "Gather everything into" : "From wallet"}</div>
        <div className="flex flex-wrap gap-1.5">
          {wallets.map((w) => <button key={w.slot} onClick={() => { setFrom(w.slot); setTargets((t) => t.filter((x) => x !== w.slot)); setReview(false); }} className={chip(from === w.slot)}>w{w.slot} · {w.label}</button>)}
        </div>
      </div>
      {mode === "merge" ? (
        <div>
          <div className="mb-1 text-xs text-muted-foreground">What to gather</div>
          <div className="flex gap-1.5">
            <button onClick={() => setOnly("all")} className={chip(only === "all")}>All tokens + SUI</button>
            <button onClick={() => setOnly("sui")} className={chip(only === "sui")}>SUI only</button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Each other wallet keeps 0.02 SUI for network fees. A wallet with less SUI than that is skipped.</p>
        </div>
      ) : (
        <>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Token</div>
            {!toks ? <p className="text-xs text-muted-foreground">Loading…</p> : toks.length === 0 ? <p className="text-xs text-muted-foreground">This wallet is empty.</p> : (
              <select value={coin} onChange={(e) => setCoin(e.target.value)} className="w-full rounded-xl border border-border bg-card px-3 py-2">
                {toks.map((t) => <option key={t.coinType} value={t.coinType}>{t.symbol} — {fmt(t.amount)}</option>)}
              </select>
            )}
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">{mode === "move" ? "Amount to each wallet" : "Amount"}</div>
            <div className="flex gap-2">
              <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="0.0" className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2 font-mono" />
              <button onClick={() => setAmount("max")} className={chip(amount === "max")}>MAX</button>
            </div>
            {amount === "max" && <p className="mt-1 text-xs text-muted-foreground">Sends all of it{tok?.symbol === "SUI" ? ", keeping 0.02 SUI for fees" : ""}. One destination only.</p>}
          </div>
          {mode === "move" ? (
            <div>
              <div className="mb-1 text-xs text-muted-foreground">To wallets</div>
              <div className="flex flex-wrap gap-1.5">
                {wallets.filter((w) => w.slot !== from).map((w) => <button key={w.slot} onClick={() => setTargets((t) => t.includes(w.slot) ? t.filter((x) => x !== w.slot) : [...t, w.slot])} className={chip(targets.includes(w.slot))}>w{w.slot} · {w.label}</button>)}
                {wallets.length < 2 && <p className="text-xs text-muted-foreground">Add a second wallet first.</p>}
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-1 text-xs text-muted-foreground">External Sui address</div>
              <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x…" className="w-full rounded-xl border border-border bg-card px-3 py-2 font-mono text-xs" />
              {addr && !validAddr && <p className="mt-1 text-xs text-destructive">That doesn't look like a Sui address (0x…).</p>}
            </div>
          )}
        </>
      )}
      {review ? (
        <div className="rounded-xl border border-primary bg-primary/10 p-3 text-xs">
          <b className="text-sm">Review</b>
          <p className="mt-1">{mode === "merge"
            ? `Move ${only === "all" ? "all tokens and SUI" : "all SUI"} from every other wallet into ${wname(from)}.`
            : `Send ${amount === "max" ? "all" : amount} ${tok?.symbol} from ${wname(from)} to ${mode === "move" ? targets.map(wname).join(", ") : addr.trim()}.`}</p>
          {mode === "withdraw" && <p className="mt-1 text-muted-foreground">Transfers to an outside address can't be undone. Check it carefully.</p>}
          <div className="mt-2 flex gap-2">
            <button disabled={busy} onClick={run} className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Sending…" : "Confirm"}</button>
            <button disabled={busy} onClick={() => setReview(false)} className="rounded-xl border border-border px-3 py-2 text-sm">Back</button>
          </div>
        </div>
      ) : (
        <button disabled={!canReview} onClick={() => { setOut(null); setErr(null); setReview(true); }} className="w-full rounded-xl bg-primary py-2 font-semibold text-primary-foreground disabled:opacity-50">Review</button>
      )}
      {err && <p className="text-xs text-destructive">{err}</p>}
      {out && (
        <ul className="space-y-1 text-xs">
          {out.map((o, i) => (
            <li key={i} className={o.ok ? "text-foreground" : "text-destructive"}>
              {o.ok ? "✅" : "❌"} {o.text}{o.digest && <> · <a className="text-cyber underline" href={`https://suiscan.xyz/mainnet/tx/${o.digest}`} target="_blank" rel="noreferrer">Suiscan</a></>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BridgeHistory({ initData }: { initData: string }) {
  const load = useServerFn(tgBridgeHistory);
  const [items, setItems] = useState<Awaited<ReturnType<typeof tgBridgeHistory>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const run = () => load({ data: { initData } }).then((r) => { if (alive) { setItems(r); setErr(null); } }).catch((e) => alive && setErr(e instanceof Error ? e.message : "Couldn't load"));
    void run();
    const t = setInterval(run, 8000);
    return () => { alive = false; clearInterval(t); };
  }, [initData, load]);
  const pending = items?.some((i) => i.state === "pending");
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">Bridge history</span>
        {pending && <span className="text-xs text-primary">● live</span>}
      </div>
      {err && <p className="text-xs text-muted-foreground">{err}</p>}
      {!err && !items && <p className="text-xs text-muted-foreground">Loading…</p>}
      {items?.length === 0 && <p className="text-xs text-muted-foreground">No bridges yet. Bridges in or out of Sui show here with live progress.</p>}
      <ul className="space-y-2">
        {items?.map((i) => (
          <li key={i.id} className="rounded-xl border border-border p-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{i.dir === "in" ? "⬇ In" : "⬆ Out"} · {i.label}</span>
              <span className={i.state === "done" ? "text-primary" : i.state === "failed" ? "text-destructive" : "text-muted-foreground"}>
                {i.state === "done" ? "Done" : i.state === "failed" ? "Failed" : "In progress"}
              </span>
            </div>
            <div className="mt-1 text-muted-foreground">{i.detail} · {new Date(i.createdAt).toLocaleString()}</div>
            {i.links.length > 0 && (
              <div className="mt-1 flex gap-3">
                {i.links.map((l) => <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="text-primary underline">{l.text}</a>)}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
