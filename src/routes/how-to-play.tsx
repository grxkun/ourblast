import { Link, createFileRoute } from "@tanstack/react-router";

import { SectionTitle } from "@/components/blast/AppShell";
import { useBlast } from "@/components/blast/session";
import helmet from "@/assets/helmet.jpg.asset.json";
import mascotCoin from "@/assets/mascot-coin.jpg.asset.json";
import mascotShock from "@/assets/mascot-shock.jpg.asset.json";
import { CHAT_DAILY_POINT_CAP, POINTS, formatNumber } from "@/lib/blast";
import { ECONOMY, FEES, playsToTarget } from "@/lib/ourblast.config";

export const Route = createFileRoute("/how-to-play")({
  head: () => ({
    meta: [
      { title: "How to Play — Wallet, Fees & Points Guide | OURBLAST" },
      {
        name: "description",
        content:
          "New to OURBLAST? Connect your Slush wallet, pay the 0.1 SUI arcade fee, play BLAST CLICK and learn exactly how BLAST POINTS and the leaderboard work.",
      },
      { property: "og:title", content: "How to Play OURBLAST" },
      {
        property: "og:description",
        content:
          "A five-step beginner guide: wallet, fee, game, points, leaderboard. Plus chat rules and FAQ.",
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
    body: `Every arcade run costs ${FEES.game} SUI and every chat message costs ${FEES.chat} SUI. The fee goes straight to the community treasury and funds prizes and events.`,
  },
  {
    n: "03",
    title: "Pay, then play BLAST CLICK",
    body: "Press Play, approve the payment in your wallet, and the 30-second round starts the moment the transfer is confirmed. Click fast, keep the combo alive, do not stop.",
  },
  {
    n: "04",
    title: "Bank your BLAST POINTS",
    body: `Every finished run pays ${POINTS.playGame} points, a new personal best adds ${POINTS.highScore}, and finishing the daily mission adds ${POINTS.dailyChallenge}.`,
  },
  {
    n: "05",
    title: "Climb the leaderboard",
    body: "Your best score of the day lands on the board instantly. Come back daily — the login bonus, challenges and achievements stack up fast.",
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
  {
    q: "How do chat points work?",
    a: `Your first ${CHAT_DAILY_POINT_CAP} messages each day earn ${POINTS.chatMessage} points each. Spam, slurs and copy-paste shilling get muted.`,
  },
  {
    q: "Do points move my score?",
    a: "They are separate. Score ranks you on the leaderboard, points are your all-time community standing.",
  },
] as const;

function HowToPlay() {
  const { userId, connect, connecting, profile } = useBlast();

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
              Five steps from a fresh wallet to your name on the leaderboard. It takes about a
              minute.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              {userId ? (
                <Link
                  to="/arcade"
                  className="rounded-full bg-primary px-7 py-3 font-display text-lg tracking-wide text-primary-foreground uppercase transition-transform hover:-translate-y-0.5"
                >
                  Start playing
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
              <Link
                to="/leaderboard"
                className="rounded-full bg-secondary px-7 py-3 font-display text-lg tracking-wide text-secondary-foreground uppercase transition-transform hover:-translate-y-0.5"
              >
                See the board
              </Link>
            </div>
            {userId ? (
              <p className="mt-4 font-body text-sm text-muted-foreground">
                You have {formatNumber(profile?.points ?? 0)} BLAST POINTS banked.
              </p>
            ) : null}
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
            <li>
              <span className="font-semibold text-foreground">Best score wins.</span> Only your
              highest score of the day is ranked, so replay freely.
            </li>
            <li>
              <span className="font-semibold text-foreground">Daily mission.</span> Hit the target
              on the arcade page for a {formatNumber(POINTS.dailyChallenge)} point bonus.
            </li>
          </ul>
        </div>

        <div className="panel p-5 sm:p-6">
          <SectionTitle kicker="Earning" title="Points cheat sheet" />
          <dl className="space-y-2">
            {[
              { k: "Daily login", v: POINTS.dailyLogin },
              { k: "Finish a run", v: POINTS.playGame },
              { k: "New personal best", v: POINTS.highScore },
              { k: "Daily challenge", v: POINTS.dailyChallenge },
              { k: "Achievement", v: POINTS.achievement },
              { k: "Chat message", v: POINTS.chatMessage },
              { k: "Meme vote", v: POINTS.memeVote },
              { k: "Meme submitted", v: POINTS.memeSubmit },
            ].map((row) => (
              <div
                key={row.k}
                className="flex items-center justify-between rounded-xl border border-border px-3 py-2"
              >
                <dt className="font-body text-sm">{row.k}</dt>
                <dd className="font-display text-lg text-primary">+{formatNumber(row.v)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 font-body text-xs text-muted-foreground">
            Runs and personal bests scale with the difficulty you choose (Chill x1, Normal x1.25,
            Helmet off x1.6), and a strong score adds up to {formatNumber(POINTS.skillBonusCap)}{" "}
            bonus points on top.
          </p>
        </div>

        <div className="panel p-5 sm:p-6">
          <SectionTitle kicker="Treasury" title={`Where your ${FEES.game} SUI goes`} />
          <ul className="space-y-2 font-body text-sm">
            {[
              ["Season prize pool for top players", ECONOMY.prizePoolShare],
              ["$BLAST buybacks", ECONOMY.buybackShare],
              ["Hosting, art and tools", ECONOMY.opsShare],
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
            days — about {formatNumber(playsToTarget())} paid actions. Every payment goes straight
            from your wallet to the community treasury, on-chain and public.
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
          Go take somebody's spot on the leaderboard.
        </p>
        <Link
          to="/arcade"
          className="rounded-full bg-primary px-8 py-3.5 font-display text-xl tracking-wide text-primary-foreground uppercase transition-transform hover:-translate-y-0.5"
        >
          Play Blast Click
        </Link>
      </section>
    </div>
  );
}
