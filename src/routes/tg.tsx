// SPDX-License-Identifier: BUSL-1.1
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Star } from "lucide-react";

import { listPublicLaunches } from "@/lib/terminal/launch-status.functions";
import { tgLinkX, tgSession, tgToggleWatch, tgUnlinkX } from "@/lib/tg/tg.functions";

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
  const [tab, setTab] = useState<"live" | "watch">("live");

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
  const rows = (tab === "watch" ? launches.filter((l) => watch.has(l.id)) : launches).slice(0, 60);

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

  return (
    <main className="mx-auto min-h-screen max-w-md bg-background px-4 py-5 text-foreground">
      <h1 className="font-display text-2xl">OURBLAST</h1>
      <p className="text-sm text-muted-foreground">{session ? `gm ${session.name}` : (error ?? "Connecting to Telegram…")}</p>
      {session && (
        <div className="mt-3 rounded-lg border border-border bg-card p-3 text-sm">
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
            <ClientOnly fallback={null}>
              <Suspense fallback={<div className="text-muted-foreground">Loading…</div>}>
                <PrivyXLink appId={session.privyAppId} onToken={onPrivyToken} />
              </Suspense>
            </ClientOnly>
          ) : (
            <span className="text-muted-foreground">X linking is not set up yet.</span>
          )}
          {error && session && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {(["live", "watch"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-md border px-3 py-2 text-sm ${tab === t ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
            {t === "live" ? "Live launches" : `Watchlist (${watch.size})`}
          </button>
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {rows.length === 0 && <li className="text-sm text-muted-foreground">Nothing here yet.</li>}
        {rows.map((l) => (
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
    </main>
  );
}
