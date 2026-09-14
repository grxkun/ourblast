import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { PlayerAvatar, PlayerName } from "@/components/blast/PlayerBadge";
import { useBlast } from "@/components/blast/session";
import { formatNumber } from "@/lib/blast";
import { PERIODS, type Period, fetchLeaderboard } from "@/lib/leaderboard";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — Top Blast Arcade Players | OURBLAST" },
      {
        name: "description",
        content:
          "Daily, weekly, seasonal and all-time rankings for the OURBLAST arcade. See who is topping BLAST CLICK and how ranks are moving.",
      },
      { property: "og:title", content: "OURBLAST Leaderboard" },
      {
        property: "og:description",
        content: "Daily, weekly, seasonal and all-time Blast arcade rankings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const [period, setPeriod] = useState<Period>("all");
  const { userId } = useBlast();

  const board = useQuery({
    queryKey: ["leaderboard", period],
    queryFn: () => fetchLeaderboard(period),
  });

  const rows = board.data ?? [];
  const you = rows.find((r) => r.userId === userId);

  return (
    <div className="space-y-8">
      <div>
        <p className="font-body text-xs font-bold tracking-[0.22em] text-cyber uppercase">Ranks</p>
        <h1 className="mt-1 font-display text-4xl sm:text-5xl">Leaderboard</h1>
        <p className="mt-3 max-w-xl font-body text-muted-foreground">
          Ranked by each player's latest verified run. Scores are validated before they land here.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            className={`rounded-full px-5 py-2 font-display text-sm tracking-wide uppercase transition-colors ${
              period === p.key
                ? "glow-blast bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {you ? (
        <div className="panel glow-cyber flex items-center gap-4 p-4">
          <span className="font-display text-2xl text-cyber">#{you.rank}</span>
          <PlayerAvatar address={you.wallet} size={40} />
          <div className="flex-1">
            <PlayerName address={you.wallet} nickname={you.nickname} />
            <p className="font-body text-xs text-muted-foreground">That's you</p>
          </div>
          <span className="font-display text-2xl text-lime">{formatNumber(you.score)}</span>
        </div>
      ) : null}

      <div className="panel overflow-hidden">
        {board.isLoading ? (
          <p className="p-6 font-body text-muted-foreground">Counting the points…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 font-body text-muted-foreground">
            No runs in this window yet. Head to the arcade and set the pace.
          </p>
        ) : (
          <ol>
            {rows.slice(0, 100).map((row) => {
              const move =
                row.previousRank === null ? null : row.previousRank - row.rank;
              return (
                <li
                  key={row.userId}
                  className={`flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 sm:px-6 ${
                    row.userId === userId ? "bg-secondary/40" : ""
                  }`}
                >
                  <span
                    className={`w-10 font-display text-lg ${
                      row.rank <= 3 ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    #{row.rank}
                  </span>
                  <PlayerAvatar address={row.wallet} size={36} />
                  <div className="min-w-0 flex-1">
                    <PlayerName address={row.wallet} nickname={row.nickname} />
                    <p className="font-body text-xs text-muted-foreground">
                      {formatNumber(row.runs)} verified {row.runs === 1 ? "run" : "runs"}
                    </p>
                  </div>
                  {move !== null && move !== 0 ? (
                    <span
                      className={`font-body text-xs font-bold ${move > 0 ? "text-lime" : "text-destructive"}`}
                    >
                      {move > 0 ? `▲ ${move}` : `▼ ${Math.abs(move)}`}
                    </span>
                  ) : null}
                  <span className="font-display text-xl text-lime">{formatNumber(row.score)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
