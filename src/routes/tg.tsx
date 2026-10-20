// SPDX-License-Identifier: BUSL-1.1
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink, Home, Search, Star, Wallet, Zap } from "lucide-react";
import { toast } from "sonner";

import { listPublicLaunches } from "@/lib/terminal/launch-status.functions";
import { tgGetBankWallet, tgLinkX, tgSession, tgToggleWatch, tgUnlinkX } from "@/lib/tg/tg.functions";

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

  const list = (items: typeof launches) => (
    <ul className="space-y-2">
      {items.length === 0 && <li className="text-sm text-muted-foreground">Nothing here yet.</li>}
      {items.map((l) => (
        <li key={l.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          <div className="min-w-0 flex-1">
            <div className="font-semibold">${l.symbol ?? "?"} <span className="text-xs text-muted-foreground">{l.launchpad}</span></div>
            <div className="truncate text-xs text-muted-foreground">@{l.xUsername} · {l.status}</div>
          </div>
          {l.tokenUrl && <a href={l.tokenUrl} target="_blank" rel="noreferrer" aria-label="Open token"><ExternalLink className="h-4 w-4" /></a>}
          <button aria-label="Toggle watchlist" disabled={!session} onClick={() => onStar(l.id)}>
            <Star className={`h-5 w-5 ${watch.has(l.id) ? "fill-primary text-primary" : "text-muted-foreground"}`} />
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <main className="mx-auto min-h-screen max-w-md bg-background px-4 pt-5 pb-24 text-foreground">
      <header className="mb-4">
        <h1 className="font-display text-2xl">OUR<span className="text-primary">BLAST</span></h1>
        <p className="text-sm text-muted-foreground">{session ? `gm ${session.name}` : (error ?? "Connecting to Telegram…")}</p>
      </header>

      {tab === "home" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {([
              ["discover", "New launches", "Fresh on Sui"],
              ["wallet", "My wallet", "Balances & deposits"],
              ["trade", "Trade & launch", "Commands for the bot"],
              ["discover", `Watchlist (${watch.size})`, "Your starred tokens"],
            ] as const).map(([t, title, sub], i) => (
              <button key={i} onClick={() => { setTab(t); if (i === 3) setFilter("watch"); else if (i === 0) setFilter("live"); }}
                className="rounded-lg border border-border bg-card p-3 text-left">
                <div className="text-sm font-semibold">{title}</div>
                <div className="text-xs text-muted-foreground">{sub}</div>
              </button>
            ))}
          </div>
          <h2 className="font-display text-lg">Latest launches</h2>
          {list(launches.slice(0, 5))}
        </div>
      )}

      {tab === "discover" && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ticker, creator or launchpad"
              className="w-full bg-transparent text-sm outline-none" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(["live", "watch"] as const).map((t) => (
              <button key={t} onClick={() => setFilter(t)}
                className={`rounded-md border px-3 py-2 text-sm ${filter === t ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                {t === "live" ? "Live launches" : `Watchlist (${watch.size})`}
              </button>
            ))}
          </div>
          {list(rows)}
        </div>
      )}

      {tab === "trade" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Trading and launching run through @Ourblastbot. Tap a command to copy it, then post it on X or paste it in the web Terminal.</p>
          {[
            "@Ourblastbot buy 1 sui of $BLAST",
            "@Ourblastbot sell all $BLAST",
            "@Ourblastbot launch $TICKER, Name, on suipump",
            "@Ourblastbot bridge 0.05 sol to sui",
            "@Ourblastbot bridge 10 sui to bnb",
          ].map((c) => (
            <button key={c} onClick={() => copy(c)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card p-3 text-left font-mono text-xs">
              <span className="truncate">{c}</span><Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
          <a href="https://ourblast.xyz/" target="_blank" rel="noreferrer" className="block rounded-md bg-primary px-3 py-2 text-center text-sm font-semibold text-primary-foreground">Open the Terminal</a>
        </div>
      )}

      {tab === "wallet" && (
        <div className="space-y-3">
          {xCard}
          {session?.xUsername && initData && <WalletView initData={initData} handle={session.xUsername} />}
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

function WalletView({ initData, handle }: { initData: string; handle: string }) {
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
    <div className="space-y-3">
      <div className="rounded-lg border border-primary bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase text-muted-foreground">OurBank · @{w.handle}</span>
          <button className="text-xs underline text-muted-foreground" onClick={load}>Refresh</button>
        </div>
        <ul className="mt-2 space-y-1">
          {chainRows.length === 0 && <li className="text-sm text-muted-foreground">No balances yet. Deposit to an address below.</li>}
          {chainRows.map((r) => (
            <li key={r.k} className="flex justify-between text-sm">
              <span>{r.label} <span className="text-xs text-muted-foreground">{r.chain}</span></span>
              <span className="font-mono">{fmt(r.amount)}</span>
            </li>
          ))}
        </ul>
      </div>
      <AddressRow label="Sui wallet" address={w.address} explorer={`https://suiscan.xyz/mainnet/account/${w.address}`} note="Send SUI or any Sui token here." />
      <AddressRow label="EVM deposit (BNB, Base, Arbitrum)" address={w.evmAddress} note="Funds stay here until you ask the bot to bridge them." />
      <AddressRow label="Solana deposit (SOL, USDC)" address={w.solAddress} explorer={w.solAddress ? `https://solscan.io/account/${w.solAddress}` : undefined} note="Funds stay here until you ask the bot to bridge them." />
    </div>
  );
}
