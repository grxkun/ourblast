// SPDX-License-Identifier: BUSL-1.1
import { Link, createFileRoute } from "@tanstack/react-router";

import { SectionTitle } from "@/components/blast/AppShell";
import { useBlast } from "@/components/blast/session";
import { formatNumber } from "@/lib/blast";
import helmet from "@/assets/helmet.jpg.asset.json";
import mascotCoin from "@/assets/mascot-coin.jpg.asset.json";
import mascotShock from "@/assets/mascot-shock.jpg.asset.json";
import { ECONOMY, FEES, playsToTarget } from "@/lib/ourblast.config";

export const Route = createFileRoute("/how-to-play")({
  head: () => ({
    meta: [
      { title: "How to Play — Wallet & Fees Guide | OURBLAST" },
      {
        name: "description",
        content:
          "New to OURBLAST? Connect your Slush wallet, pay the 1 SUI arcade fee, play BLAST CLICK.",
      },
      { property: "og:title", content: "How to Play OURBLAST" },
      {
        property: "og:description",
        content:
          "A three-step beginner guide: wallet, fee, game. Plus chat rules and FAQ.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HowToPlay,
});

const STEPS = [
  {
    n: "01",
    title: "Connect your Slush wallet",
    body: "Tap Connect Slush in the top corner. Your wallet address is your player identity — no email, no password. Approve the connection request and you are in.",
  },
  {
    n: "02",
    title: `Keep a little SUI ready`,
    body: `Every arcade run costs ${FEES.game} SUI and every chat message costs ${FEES.chat} SUI. 70% of every game fee funds the prize pool for the winning players — paid back to you.`,
  },
  {
    n: "03",
    title: "Pay, then play BLAST CLICK",
    body: "Press Play, approve the payment in your wallet, and the 30-second round starts the moment the transfer is confirmed. Click fast, keep the combo alive, do not stop.",
  },
] as const;

const FAQ = [
  {
    q: "What happens if I cancel the payment?",
    a: "Nothing is charged and the round never starts. You can try again straight away.",
  },
  {
    q: "Can one payment be used twice?",
    a: "No. Each transaction is checked on-chain against the treasury address and amount, and can be banked exactly once.",
  },
] as const;

function HowToPlay() {
  const { userId, connect, connecting } = useBlast();

  return (
    <div className="space-y-14">
      <section className="panel animate-pop-in relative overflow-hidden px-5 py-10 sm:px-10 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_auto] lg:items-center">
          <div>
            <p className="font-body text-xs font-bold tracking-[0.22em] text-primary uppercase">
              Beginner guide
            </p>
            <h1 className="mt-2 font-display text-[clamp(2.4rem,8vw,4.5rem)] leading-[0.9]">
              How to play <span className="text-primary">OURBLAST</span>
            </h1>
            <p className="mt-4 max-w-xl font-body text-lg text-muted-foreground">
              Three steps from a fresh wallet to your first round. It takes about a
              minute.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              {userId ? (
                <Link
                  to="/hub"
                  className="rounded-full bg-primary px-7 py-3 font-display text-lg tracking-wide text-primary-foreground uppercase transition-transform hover:-translate-y-0.5"
                >
                  Open the Hub
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => void connect()}
                  disabled={connecting}
                  className="rounded-full bg-primary px-7 py-3 font-display text-lg tracking-wide text-primary-foreground uppercase transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {connecting ? "Connecting…" : "Connect Slush"}
                </button>
              )}
            </div>
          </div>

          <img
            src={mascotCoin.url}
            alt="BLAST mascot standing on a giant red coin"
            width={260}
            height={260}
            className="mx-auto w-40 rounded-3xl border-2 border-border object-cover sm:w-56 lg:w-64"
          />
        </div>
      </section>

      <section>
        <SectionTitle kicker="Step by step" title="Your first run" />
        <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.n} className="panel p-5 sm:p-6">
              <span className="font-display text-3xl text-primary">{step.n}</span>
              <h3 className="mt-3 font-display text-2xl">{step.title}</h3>
              <p className="mt-2 font-body text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
          <li className="panel flex items-center gap-4 p-5 sm:p-6">
            <img
              src={helmet.url}
              alt="BLAST pixel helmet"
              width={72}
              height={72}
              loading="lazy"
              className="size-16 shrink-0 rounded-2xl border-2 border-border object-cover"
            />
            <p className="font-body text-sm text-muted-foreground">
              Stuck? Ask in{" "}
              <Link to="/chat" className="font-semibold text-primary hover:underline">
                Blast chat
              </Link>{" "}
              — someone is always around.
            </p>
          </li>
        </ol>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="panel p-5 sm:p-6">
          <SectionTitle kicker="Scoring" title="How BLAST CLICK works" />
          <ul className="space-y-3 font-body text-muted-foreground">
            <li>
              <span className="font-semibold text-foreground">30 seconds.</span> The clock starts
              after your payment is confirmed.
            </li>
            <li>
              <span className="font-semibold text-foreground">Combos.</span> Fast, uninterrupted
              clicks raise your multiplier; pausing resets it.
            </li>
          </ul>
        </div>

        <div className="panel p-5 sm:p-6">
          <SectionTitle kicker="Treasury" title={`Where your ${FEES.game} SUI goes`} />
          <ul className="space-y-2 font-body text-sm">
            {[
              ["Prize pool — paid back to the winning players", ECONOMY.prizePoolShare],
              ["Community treasury — events, buybacks, hosting", ECONOMY.opsShare],
              ["Founder", ECONOMY.founderShare],
            ].map(([label, share]) => (
              <li
                key={label as string}
                className="flex items-center justify-between rounded-xl border border-border px-3 py-2"
              >
                <span>{label}</span>
                <span className="font-display text-lg text-primary">
                  {Math.round((share as number) * 100)}%
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-body text-xs text-muted-foreground">
            Season target: {formatNumber(ECONOMY.seasonTargetSui)} SUI over {ECONOMY.seasonDays}{" "}
            days — about {formatNumber(playsToTarget())} paid actions. Every payment is split
            automatically on-chain the moment you approve it: {Math.round(ECONOMY.prizePoolShare * 100)}% to the prize pool wallet, {Math.round(ECONOMY.opsShare * 100)}% to the community treasury, and {Math.round(ECONOMY.founderShare * 100)}% to the founder wallet — on-chain and public.
          </p>
        </div>
      </section>

      <section>
        <SectionTitle kicker="Questions" title="Good to know" />
        <div className="grid gap-5 sm:grid-cols-2">
          {FAQ.map((item) => (
            <div key={item.q} className="panel p-5 sm:p-6">
              <h3 className="font-display text-xl">{item.q}</h3>
              <p className="mt-2 font-body text-sm text-muted-foreground">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel flex flex-col items-center gap-5 p-7 text-center sm:p-10">
        <img
          src={mascotShock.url}
          alt="BLAST mascot shocked at a high score"
          width={200}
          height={200}
          loading="lazy"
          className="w-32 rounded-3xl border-2 border-border object-cover sm:w-40"
        />
        <h2 className="font-display text-3xl sm:text-4xl">That is the whole tutorial.</h2>
        <p className="max-w-md font-body text-muted-foreground">
          Head to the Hub to see what's on today.
        </p>
        <Link
          to="/hub"
          className="rounded-full bg-primary px-8 py-3.5 font-display text-xl tracking-wide text-primary-foreground uppercase transition-transform hover:-translate-y-0.5"
        >
          Open the Hub
        </Link>
      </section>
    </div>
  );
}
