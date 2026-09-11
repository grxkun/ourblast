import { Link, createFileRoute } from "@tanstack/react-router";

import helmet from "@/assets/helmet.jpg.asset.json";
import mascotStand from "@/assets/mascot-stand.jpg.asset.json";
import mascotShock from "@/assets/mascot-shock.jpg.asset.json";
import mascotCoin from "@/assets/mascot-coin.jpg.asset.json";
import { Ticker } from "@/components/site/Ticker";
import { CopyAddress } from "@/components/site/CopyAddress";
import { VaultSizes } from "@/components/site/VaultSizes";
import { BlastChart } from "@/components/site/BlastChart";

const CONTRACT = "0x577a8addf60a34d4c705914ad066a3b28c3fc40d365ed0d9dfc408f29b4725d3::blast::BLAST";
const BUY_URL = "https://trade.bluefin.io/swap/SUI-0x577a8addf60a34d4c705914ad066a3b28c3fc40d365ed0d9dfc408f29b4725d3::blast::BLAST";
const X_URL = "https://x.com/Blastdotv2";
const TG_URL = "https://t.me/Blastnotfun_CTO";
const TREASURY = "0xd9ba2ba33cc6eb61302cec564126caae22fbbe10f564789c5e6e5eca0940372c";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "$BLAST — Helmets On, Community Owned Coin on Blast.fun" },
      {
        name: "description",
        content:
          "$BLAST is a community takeover coin on blast.fun. No dev, no roadmap, LP burned, zero tax. Grab a helmet and ride the chart.",
      },
      { property: "og:title", content: "$BLAST — Helmets On, Community Owned" },
      {
        property: "og:description",
        content:
          "A community takeover coin on blast.fun. No dev, no roadmap, LP burned, zero tax. Helmets on.",
      },
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

const STEPS = [
  {
    n: "01",
    title: "Grab a Sui wallet",
    body: "Slush or any Sui wallet works. Keep a little SUI in it for gas and swaps.",
  },
  {
    n: "02",
    title: "Open Bluefin",
    body: "Paste the $BLAST address below, swap SUI for $BLAST, and confirm in your wallet.",
  },
  {
    n: "03",
    title: "Helmet on",
    body: "You're in. Join the group chat and help decide what happens next.",
  },
];

function Home() {
  return (
    <main className="theme-paper min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* nav */}
      <header className="sticky top-0 z-50 border-b-[3px] border-border bg-background/90 backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:flex sm:justify-between sm:gap-4 sm:px-5">
          <a href="#top" className="flex min-w-0 items-center gap-2 sm:gap-3">
            <img
              src={helmet.url}
              alt="$BLAST pixel helmet mascot"
              className="animate-zap size-10 shrink-0 rounded-lg border-[3px] border-border bg-card object-cover sm:size-11"
            />
            <span className="truncate font-display text-xl tracking-wide sm:text-2xl">$BLAST</span>
          </a>
          <nav className="hidden items-center gap-7 font-body text-sm font-medium sm:flex">
            <a className="hover:text-primary" href="#chart">
              Chart
            </a>
            <a className="hover:text-primary" href="#story">
              The takeover
            </a>
            <a className="hover:text-primary" href="#numbers">
              Numbers
            </a>
            <a className="hover:text-primary" href="#buy">
              How to buy
            </a>
            <Link className="hover:text-primary" to="/hub">
              Arcade
            </Link>
          </nav>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <a
              href={X_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="X (Twitter)"
              className="flex size-10 items-center justify-center rounded-lg border-[3px] border-border bg-card font-display text-base shadow-[4px_4px_0_0_var(--ink)] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 sm:size-11"
            >
              X
            </a>
            <a
              href={TG_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Telegram"
              className="flex size-10 items-center justify-center rounded-lg border-[3px] border-border bg-card font-display text-sm shadow-[4px_4px_0_0_var(--ink)] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 sm:size-11"
            >
              TG
            </a>
            <a
              href={BUY_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border-[3px] border-border bg-primary px-3 py-2 font-display text-base tracking-wide text-primary-foreground shadow-[4px_4px_0_0_var(--ink)] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 sm:px-4 sm:text-lg"
            >
              BUY
              <span className="hidden sm:inline"> $BLAST</span>
            </a>
          </div>
        </div>

        {/* compact link row for phones */}
        <nav className="flex items-center gap-4 overflow-x-auto border-t-[3px] border-border px-4 py-2 font-body text-xs font-bold tracking-[0.14em] uppercase sm:hidden">
          <a className="shrink-0" href="#chart">
            Chart
          </a>
          <a className="shrink-0" href="#story">
            Takeover
          </a>
          <a className="shrink-0" href="#numbers">
            Numbers
          </a>
          <a className="shrink-0" href="#buy">
            How to buy
          </a>
          <Link className="shrink-0 text-primary" to="/hub">
            Arcade →
          </Link>
        </nav>
      </header>


      {/* hero */}
      <section id="top" className="relative mx-auto max-w-6xl px-5 pt-14 pb-16 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div className="animate-pop-in">
            <span className="inline-flex items-center gap-2 rounded-full border-[3px] border-border bg-card px-4 py-1.5 font-body text-xs font-bold tracking-[0.18em] uppercase">
              <span className="size-2.5 rounded-full bg-primary" />
              Live on blast.fun
            </span>

            <h1 className="mt-7 font-display text-[clamp(3.4rem,11vw,7.5rem)] leading-[0.86] tracking-tight uppercase">
              The dev left.
              <br />
              <span className="text-primary">We kept</span>
              <br />
              the helmet.
            </h1>

            <p className="mt-7 max-w-lg font-body text-lg leading-relaxed text-muted-foreground">
              $BLAST is a community takeover on blast.fun, running on Sui. No team, no promises, no unlock schedule
              — just a chart, a group chat, and a crowd that refused to let this one die.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <a
                href={BUY_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border-[3px] border-border bg-primary px-8 py-4 font-display text-2xl tracking-wide text-primary-foreground shadow-[var(--shadow-sticker)] transition-transform hover:-translate-y-1 active:translate-y-0.5"
              >
                BUY ON BLUEFIN
              </a>
              <a
                href="#story"
                className="rounded-xl border-[3px] border-border bg-card px-8 py-4 font-display text-2xl tracking-wide shadow-[var(--shadow-sticker)] transition-transform hover:-translate-y-1 active:translate-y-0.5"
              >
                THE STORY
              </a>
            </div>
          </div>

          <div className="relative">
            <img
              src={mascotCoin.url}
              alt="$BLAST mascot standing triumphantly on a giant red BLAST coin"
              className="animate-bob mx-auto w-full max-w-md rounded-3xl border-[3px] border-border bg-card object-contain shadow-[var(--shadow-sticker-lg)]"
            />
            <div className="absolute -top-4 -left-2 rotate-[-8deg] rounded-lg border-[3px] border-border bg-card px-3 py-1.5 font-display text-lg tracking-wide shadow-[4px_4px_0_0_var(--ink)] sm:-left-6">
              HELMETS ON
            </div>
          </div>
        </div>
      </section>

      <Ticker />

      <BlastChart />

      {/* arcade */}
      <section id="arcade" className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
        <div className="grid items-center gap-10 rounded-3xl border-[3px] border-border bg-card p-7 shadow-[var(--shadow-sticker-lg)] sm:p-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border-[3px] border-border bg-background px-4 py-1.5 font-body text-xs font-bold tracking-[0.18em] uppercase">
              <span className="size-2.5 rounded-full bg-primary" />
              New: OURBLAST Arcade
            </span>
            <h2 className="mt-6 font-display text-[clamp(2.4rem,6vw,4.2rem)] leading-[0.9]">
              Play with your <span className="text-primary">helmet on</span>
            </h2>
            <p className="mt-5 max-w-xl font-body text-lg leading-relaxed text-muted-foreground">
              Connect your Sui wallet, pay 1 SUI — 70% goes to the player prize pool — and play
              for BLAST POINTS, leaderboard ranks and daily challenges. Chat, memes and the Blast
              Roast live in there too.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                to="/hub"
                className="rounded-xl border-[3px] border-border bg-primary px-8 py-4 font-display text-2xl tracking-wide text-primary-foreground shadow-[var(--shadow-sticker)] transition-transform hover:-translate-y-1 active:translate-y-0.5"
              >
                ENTER THE ARCADE
              </Link>
              <Link
                to="/leaderboard"
                className="rounded-xl border-[3px] border-border bg-background px-8 py-4 font-display text-2xl tracking-wide shadow-[var(--shadow-sticker)] transition-transform hover:-translate-y-1 active:translate-y-0.5"
              >
                LEADERBOARD
              </Link>
              <Link
                to="/how-to-play"
                className="rounded-xl border-[3px] border-border bg-card px-8 py-4 font-display text-2xl tracking-wide shadow-[var(--shadow-sticker)] transition-transform hover:-translate-y-1 active:translate-y-0.5"
              >
                HOW TO PLAY
              </Link>
            </div>
            <p className="mt-5 font-body text-sm text-muted-foreground">
              Every play fee goes to the treasury address published below. Nothing is held by a
              team wallet.
            </p>
          </div>
          <img
            src={mascotShock.url}
            alt="$BLAST mascot looking shocked at an arcade high score"
            className="animate-bob mx-auto w-full max-w-xs rounded-3xl border-[3px] border-border bg-background object-contain shadow-[var(--shadow-sticker-lg)]"
          />
        </div>
      </section>

      {/* story */}
      <section id="story" className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <img
            src={mascotShock.url}
            alt="$BLAST mascot in shock as the chart moves"
            className="mx-auto w-full max-w-sm rounded-3xl border-[3px] border-border bg-card object-contain shadow-[var(--shadow-sticker-lg)]"
          />
          <div>
            <p className="font-body text-xs font-bold tracking-[0.22em] text-primary uppercase">
              The takeover
            </p>
            <h2 className="mt-4 font-display text-[clamp(2.4rem,6vw,4.2rem)] leading-[0.9] tracking-tight uppercase">
              Nobody was driving. So we all did.
            </h2>
            <div className="mt-7 space-y-5 font-body text-lg leading-relaxed text-muted-foreground">
              <p>
                The launch was an accident. A ticker, a helmet drawing, and a deployer who
                disappeared before the first candle closed. What was left behind was a
                contract nobody controlled.
              </p>
              <p>
                So the holders took it. Liquidity burned, socials handed over, and every
                decision from that point on made in the open — in the chat, by the people
                actually holding the bag.
              </p>
            </div>
            <div className="ink-box mt-8 p-6">
              <p className="font-display text-2xl tracking-wide uppercase">
                No team. No exit. Treasury tracked.
              </p>
              <p className="mt-2 font-body text-muted-foreground">
                The only thing steering $BLAST is the crowd wearing the helmet.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* numbers */}
      <section id="numbers" className="border-y-[3px] border-border bg-muted">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-[clamp(2.4rem,6vw,4rem)] leading-none tracking-tight uppercase">
              The numbers
            </h2>
            <p className="font-body text-muted-foreground">Boring on purpose.</p>
          </div>

          <div className="mt-10">
            <VaultSizes />
          </div>


          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="ink-box p-6">
                <p className="font-body text-xs font-bold tracking-[0.18em] text-muted-foreground uppercase">
                  {s.label}
                </p>
                <p className="mt-3 font-display text-3xl leading-none tracking-wide text-primary">
                  {s.value}
                </p>
                <p className="mt-3 font-body text-sm text-muted-foreground">{s.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* how to buy */}
      <section id="buy" className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="font-body text-xs font-bold tracking-[0.22em] text-primary uppercase">
              How to buy
            </p>
            <h2 className="mt-4 font-display text-[clamp(2.4rem,6vw,4.2rem)] leading-[0.9] tracking-tight uppercase">
              Three steps, one helmet
            </h2>

            <div className="mt-9 space-y-5">
              {STEPS.map((s) => (
                <div key={s.n} className="ink-box flex gap-5 p-6">
                  <span className="font-display text-4xl leading-none text-primary">{s.n}</span>
                  <div>
                    <p className="font-display text-2xl tracking-wide uppercase">{s.title}</p>
                    <p className="mt-1 font-body text-muted-foreground">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 space-y-4">
              <div>
                <p className="mb-3 font-body text-xs font-bold tracking-[0.18em] text-muted-foreground uppercase">
                  Contract address
                </p>
                <CopyAddress address={CONTRACT} label="contract address" />
              </div>
              <div>
                <p className="mb-3 font-body text-xs font-bold tracking-[0.18em] text-muted-foreground uppercase">
                  Treasury
                </p>
                <CopyAddress address={TREASURY} label="treasury address" />
              </div>
            </div>
          </div>

          <img
            src={mascotStand.url}
            alt="$BLAST mascot standing confidently in a BLAST helmet"
            className="animate-bob mx-auto w-full max-w-sm rounded-3xl border-[3px] border-border bg-card object-contain shadow-[var(--shadow-sticker-lg)]"
          />
        </div>
      </section>

      {/* footer */}
      <footer className="border-t-[3px] border-border bg-secondary text-secondary-foreground">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <div className="flex flex-wrap items-center justify-between gap-8">
            <div className="flex items-center gap-4">
              <img
                src={helmet.url}
                alt="$BLAST pixel helmet mascot"
                className="size-14 rounded-lg border-[3px] border-border bg-card object-cover"
              />
              <div>
                <p className="font-display text-3xl tracking-wide">$BLAST</p>
                <p className="font-body text-sm text-secondary-foreground/70">
                  A community takeover on blast.fun, built on Sui
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href={X_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="X (Twitter)"
                className="rounded-lg border-[3px] border-primary px-5 py-2.5 font-display text-lg tracking-wide transition-colors hover:bg-primary"
              >
                X / TWITTER
              </a>
              <a
                href={TG_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Telegram"
                className="rounded-lg border-[3px] border-primary px-5 py-2.5 font-display text-lg tracking-wide transition-colors hover:bg-primary"
              >
                TELEGRAM
              </a>
              <a
                href={BUY_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Buy $BLAST on blast.fun"
                className="rounded-lg border-[3px] border-border bg-primary px-5 py-2.5 font-display text-lg tracking-wide text-primary-foreground"
              >
                BUY $BLAST
              </a>
            </div>
          </div>

          <p className="mt-12 border-t border-secondary-foreground/20 pt-8 font-body text-sm text-secondary-foreground/60">
            $BLAST is a meme coin with no intrinsic value and no expectation of financial
            return. Nothing here is financial advice. Do your own research.
          </p>
        </div>
      </footer>
    </main>
  );
}
