import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";

import { SectionTitle } from "@/components/blast/AppShell";
import { PlayerAvatar, PlayerName } from "@/components/blast/PlayerBadge";
import { useBlast } from "@/components/blast/session";
import { BlastClick } from "@/components/game/BlastClick";
import { BlastTutorial } from "@/components/game/BlastTutorial";
import { GamePreview } from "@/components/game/GamePreview";
import { supabase } from "@/integrations/supabase/client";
import { POINTS, formatNumber } from "@/lib/blast";
import { fetchLeaderboard } from "@/lib/leaderboard";

export const Route = createFileRoute("/arcade")({
  head: () => ({
    meta: [
      { title: "Arcade — Play BLAST CLICK | OURBLAST" },
      {
        name: "description",
        content:
          "Play BLAST CLICK: 30 seconds, combo multipliers and BLAST POINTS on every run. Complete the daily challenge for a 500 point bonus.",
      },
      { property: "og:title", content: "OURBLAST Arcade — Play BLAST CLICK" },
      {
        property: "og:description",
        content: "30-second combo clicker with points, ranks and a daily challenge.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ArcadePage,
});

function ArcadePage() {
  const { profile, userId } = useBlast();
  const gameRef = useRef<HTMLDivElement>(null);

  const leaderboard = useQuery({
    queryKey: ["leaderboard", "all"],
    queryFn: () => fetchLeaderboard("all"),
  });

  const challenge = useQuery({
    queryKey: ["challenge", "today"],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_challenges")
        .select("id, title, description, target, reward_points")
        .eq("day", new Date().toISOString().slice(0, 10))
        .maybeSingle();
      return data;
    },
  });

  const entry = useQuery({
    queryKey: ["challenge-entry", challenge.data?.id, userId],
    enabled: Boolean(challenge.data?.id && userId),
    queryFn: async () => {
      const challengeId = challenge.data?.id;
      if (!challengeId || !userId) return null;
      const { data } = await supabase
        .from("challenge_entries")
        .select("score")
        .eq("challenge_id", challengeId)
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
  });

  const target = challenge.data?.target ?? 0;
  const progress = Math.min(100, target ? ((entry.data?.score ?? 0) / target) * 100 : 0);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-body text-xs font-bold tracking-[0.22em] text-cyber uppercase">
            Arcade
          </p>
          <h1 className="mt-1 font-display text-4xl sm:text-5xl">Pick your poison</h1>
          <p className="mt-3 max-w-xl font-body text-muted-foreground">
            One game live today, more landing soon. Every run counts toward the leaderboard and your
            points balance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => gameRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
            className="glow-blast rounded-full bg-primary px-5 py-2.5 font-display text-base tracking-wide text-primary-foreground uppercase transition-transform hover:-translate-y-0.5"
          >
            Play for real
          </button>
          <Link
            to="/how-to-play"
            className="rounded-full border-2 border-border px-5 py-2.5 font-display text-base tracking-wide uppercase transition-transform hover:-translate-y-0.5"
          >
            How to play
          </Link>
        </div>
      </div>

      <GamePreview />

      <section className="panel overflow-hidden" aria-labelledby="arcade-leaderboard-title">
        <div className="flex items-end justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div>
            <p className="font-body text-xs font-bold tracking-[0.22em] text-cyber uppercase">
              Verified players
            </p>
            <h2 id="arcade-leaderboard-title" className="mt-1 font-display text-3xl">
              Arcade leaderboard
            </h2>
          </div>
          <Link
            to="/leaderboard"
            className="shrink-0 font-display text-sm text-primary underline decoration-2 underline-offset-4"
          >
            View all
          </Link>
        </div>

        {leaderboard.isLoading ? (
          <p className="px-5 py-6 font-body text-sm text-muted-foreground sm:px-6">
            Counting verified scores…
          </p>
        ) : leaderboard.isError ? (
          <p className="px-5 py-6 font-body text-sm text-muted-foreground sm:px-6">
            Rankings are taking a breather. Try again shortly.
          </p>
        ) : (leaderboard.data?.length ?? 0) === 0 ? (
          <p className="px-5 py-6 font-body text-sm text-muted-foreground sm:px-6">
            No verified paid runs yet. Play for real and claim the first spot.
          </p>
        ) : (
          <ol>
            {leaderboard.data?.slice(0, 5).map((row) => (
              <li
                key={row.userId}
                className={`flex items-center gap-3 border-b border-border px-5 py-3 last:border-0 sm:px-6 ${
                  row.userId === userId ? "bg-secondary/40" : ""
                }`}
              >
                <span className="w-8 shrink-0 font-display text-lg text-primary">#{row.rank}</span>
                <PlayerAvatar address={row.wallet} size={36} />
                <div className="min-w-0 flex-1">
                  <PlayerName address={row.wallet} nickname={row.nickname} />
                  <p className="font-body text-xs text-muted-foreground">
                    {formatNumber(row.runs)} verified {row.runs === 1 ? "run" : "runs"}
                  </p>
                </div>
                <span className="shrink-0 font-display text-xl text-lime">
                  {formatNumber(row.best)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <BlastTutorial onPlay={() => gameRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })} />

      <div ref={gameRef}>
        <BlastClick />
      </div>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="panel p-5 sm:p-6">
          <SectionTitle kicker="Daily challenge" title="Today's mission" />
          {challenge.data ? (
            <>
              <p className="font-display text-2xl">{challenge.data.title}</p>
              <p className="mt-2 font-body text-muted-foreground">{challenge.data.description}</p>
              <div className="mt-5">
                <div className="flex justify-between font-body text-sm">
                  <span className="text-muted-foreground">
                    {formatNumber(entry.data?.score ?? 0)} / {formatNumber(target)} hits
                  </span>
                  <span className="text-lime">
                    +{formatNumber(challenge.data.reward_points)} pts
                  </span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
                  <div
                    className="glow-blast h-full rounded-full bg-primary transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </>
          ) : (
            <p className="font-body text-muted-foreground">No challenge posted yet today.</p>
          )}
        </div>

        <div className="panel p-5 sm:p-6">
          <SectionTitle kicker="How points work" title="Earn while you play" />
          <ul className="space-y-3 font-body text-sm">
            {[
              ["Daily login", POINTS.dailyLogin],
              ["Finish a game", POINTS.playGame],
              ["Beat your high score", POINTS.highScore],
              ["Daily challenge", POINTS.dailyChallenge],
              ["Unlock an achievement", POINTS.achievement],
            ].map(([label, value]) => (
              <li
                key={label as string}
                className="flex items-center justify-between rounded-xl border border-border bg-background/40 px-4 py-2.5"
              >
                <span>{label}</span>
                <span className="font-display text-lime">+{formatNumber(value as number)}</span>
              </li>
            ))}
          </ul>
          {profile ? (
            <p className="mt-4 font-body text-sm text-muted-foreground">
              Your balance: <span className="text-lime">{formatNumber(profile.points)}</span> points
              · best score {formatNumber(profile.best_score)}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
