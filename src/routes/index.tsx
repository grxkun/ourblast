import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AtSign, ShieldCheck } from "lucide-react";

import heroGallery from "@/assets/hero-gallery.jpg.asset.json";
import portrait from "@/assets/character-portrait.jpg.asset.json";
import arcadeImg from "@/assets/gateway-arcade.jpg";
import cityImg from "@/assets/gateway-city.jpg";
import hubImg from "@/assets/gateway-hub.jpg";
import { Ticker } from "@/components/site/Ticker";
import { CopyAddress } from "@/components/site/CopyAddress";
import { VaultSizes } from "@/components/site/VaultSizes";
import { BlastChart } from "@/components/site/BlastChart";
import { Terminal } from "@/components/terminal/Terminal";
import { OurBankCard } from "@/components/terminal/OurBankCard";
import { SocialSignIn } from "@/components/terminal/SocialSignIn";
import { XLaunchQueue } from "@/components/terminal/XLaunchQueue";
import { resolveLaunchpad } from "@/lib/terminal/launchpad";
import { getLauncherSettings } from "@/lib/terminal/xLauncher.functions";

const CONTRACT = "0x577a8addf60a34d4c705914ad066a3b28c3fc40d365ed0d9dfc408f29b4725d3::blast::BLAST";
const BUY_URL = "https://trade.bluefin.io/swap/SUI-0x577a8addf60a34d4c705914ad066a3b28c3fc40d365ed0d9dfc408f29b4725d3::blast::BLAST";
const X_URL = "https://x.com/Blastdotv2";
const TG_URL = "https://t.me/Blastnotfun_CTO";
const BOT_URL = "https://x.com/Ourblastbot";
const TREASURY = "0xd9ba2ba33cc6eb61302cec564126caae22fbbe10f564789c5e6e5eca0940372c";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OURBLAST — Sui Terminal, OurBank Wallet & $BLAST" },
      {
        name: "description",
        content:
          "Trade, send, launch and burn on Sui from a chat terminal or by mentioning @Ourblastbot on X. Home of the $BLAST community coin.",
      },
      { property: "og:title", content: "OURBLAST — Sui Terminal & OurBank Wallet" },
      {
        property: "og:description",
        content: "Buy, sell, send, launch and burn on Sui by chat or X mention. Enclave-protected OurBank wallets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

const STATS = [
  { label: "Total supply", value: "1,000,000,000", note: "Fixed forever, no mint" },
  { label: "Liquidity", value: "BURNED", note: "Nobody can pull it" },
  { label: "Buy / sell tax", value: "0% / 0%", note: "What you see is what you get" },
  { label: "Dev wallet", value: "NONE", note: "The community holds the keys" },
];

const GATEWAYS = [
  { to: "/arcade", title: "Arcade", body: "Play for BLAST POINTS, ranks and daily challenges.", img: arcadeImg },
  { to: "/build", title: "Builder City", body: "Build your block on Blast Island in 3D.", img: cityImg },
  { to: "/hub", title: "Coin Hub", body: "Chat, memes, roasts and the community board.", img: hubImg },
] as const;

function Home() {
  const fetchSettings = useServerFn(getLauncherSettings);
  const settings = useQuery({ queryKey: ["launcher-settings"], queryFn: () => fetchSettings({}), staleTime: 60_000 });
  const ready = Boolean(resolveLaunchpad(settings.data?.defaultLaunchpad ?? "suipump").integrated);

  return (
    <div className="space-y-10">
      <div className="overflow-hidden rounded-2xl border-[3px] border-border shadow-[var(--shadow-sticker)]">
        <img src={heroGallery.url} alt="OurBlast character in a chrome and ruby art gallery" className="aspect-[3/1] w-full object-cover object-left sm:aspect-[1280/426]" />
      </div>
      {/* hero */}
      <section className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div className="max-w-2xl">
          <p className="font-body text-xs font-bold tracking-[0.2em] text-primary uppercase">Sui agent · OurBank · $BLAST</p>
          <h1 className="mt-2 font-display text-[clamp(2.4rem,7vw,4.5rem)] leading-[0.9] uppercase">
            Trade Sui <span className="text-primary">by chat.</span>
          </h1>
          <p className="mt-3 font-body text-base text-muted-foreground">
            Buy, sell, send, launch and burn from the terminal below — or mention{" "}
            <a href={BOT_URL} target="_blank" rel="noreferrer" className="font-semibold text-foreground underline">@Ourblastbot</a>{" "}
            on X anytime.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5"><ShieldCheck className="size-3.5" /> Enclave-protected wallets</span>
          <a href={BOT_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 hover:text-foreground"><AtSign className="size-3.5" /> 24/7 on X</a>
        </div>
      </section>

      <div className="space-y-4">
        <SocialSignIn />
        {ready ? <OurBankCard /> : null}
        {ready ? <Terminal /> : (
          <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            The conversational terminal opens once a launchpad integration goes live.
          </p>
        )}
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <div className="flex items-center gap-3">
            <img src={portrait.url} alt="@Ourblastbot" className="size-12 rounded-full border-2 border-primary object-cover" />
            <h2 className="font-display text-3xl uppercase">Live from @Ourblastbot</h2>
          </div>
          <Link to="/launches" className="font-body text-sm font-semibold text-primary">All launches →</Link>
        </div>
        <XLaunchQueue />
      </section>

      {/* coin */}
      <section id="coin" className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-body text-xs font-bold tracking-[0.2em] text-primary uppercase">The coin</p>
            <h2 className="mt-1 font-display text-4xl uppercase">$BLAST — the dev left, we kept the helmet</h2>
            <p className="mt-2 max-w-2xl font-body text-muted-foreground">
              A community takeover on blast.fun. No team, no unlocks — LP burned, zero tax, decided in the open.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={BUY_URL} target="_blank" rel="noreferrer" className="rounded-lg border-[3px] border-border bg-primary px-4 py-2 font-display text-lg text-primary-foreground shadow-[4px_4px_0_0_var(--ink)]">BUY $BLAST</a>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-border"><Ticker /></div>
        <BlastChart />
        <VaultSizes />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="ink-box p-5">
              <p className="font-body text-xs font-bold tracking-[0.18em] text-muted-foreground uppercase">{s.label}</p>
              <p className="mt-2 font-display text-2xl text-primary">{s.value}</p>
              <p className="mt-2 font-body text-sm text-muted-foreground">{s.note}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="min-w-0"><p className="mb-2 font-body text-xs font-bold tracking-[0.18em] text-muted-foreground uppercase">Contract address</p><CopyAddress address={CONTRACT} label="contract address" /></div>
          <div className="min-w-0"><p className="mb-2 font-body text-xs font-bold tracking-[0.18em] text-muted-foreground uppercase">Treasury</p><CopyAddress address={TREASURY} label="treasury address" /></div>
        </div>

      </section>

      {/* gateways */}
      <section className="grid gap-4 md:grid-cols-3">
        {GATEWAYS.map((g) => (
          <Link key={g.to} to={g.to} className="group flex items-center gap-4 rounded-2xl border-[3px] border-border bg-card p-5 shadow-[var(--shadow-sticker)] transition-transform hover:-translate-y-1">
            <img src={g.img} alt="" loading="lazy" className="size-16 shrink-0 rounded-xl border-2 border-border object-cover" />
            <div>
              <p className="font-display text-2xl uppercase">{g.title} →</p>
              <p className="font-body text-sm text-muted-foreground">{g.body}</p>
            </div>
          </Link>
        ))}
      </section>

      <footer className="border-t border-border pt-6 pb-4 font-body text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center gap-4">
          <a href={X_URL} target="_blank" rel="noreferrer" className="underline">X / Twitter</a>
          <a href={TG_URL} target="_blank" rel="noreferrer" className="underline">Telegram</a>
          <Link to="/docs" className="underline">Docs</Link>
          <Link to="/terms" className="underline">Terms</Link>
          <Link to="/privacy" className="underline">Privacy</Link>
        </div>
        <p className="mt-3 text-xs">$BLAST is a meme coin with no intrinsic value. Nothing here is financial advice.</p>
      </footer>
    </div>
  );
}
