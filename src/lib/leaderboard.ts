import { supabase } from "@/integrations/supabase/client";

export type Period = "today" | "week" | "season" | "all";

export const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "season", label: "Season" },
  { key: "all", label: "All time" },
];

export type LeaderRow = {
  userId: string;
  wallet: string;
  nickname: string | null;
  best: number;
  runs: number;
  points: number;
  rank: number;
  previousRank: number | null;
};

function since(period: Period): string | null {
  const now = Date.now();
  if (period === "today") return new Date(new Date().toISOString().slice(0, 10)).toISOString();
  if (period === "week") return new Date(now - 7 * 86_400_000).toISOString();
  if (period === "season") return new Date(now - 30 * 86_400_000).toISOString();
  return null;
}

/**
 * Leaderboards read public data straight from the database. Scores are only
 * ever written by the server, so ranking client-side is safe.
 */
export async function fetchLeaderboard(period: Period): Promise<LeaderRow[]> {
  let query = supabase.from("game_sessions").select("user_id, score, created_at").limit(4000);
  const from = since(period);
  if (from) query = query.gte("created_at", from);

  const { data: sessions, error } = await query;
  if (error) throw error;

  const byUser = new Map<string, { best: number; runs: number }>();
  for (const s of sessions ?? []) {
    const current = byUser.get(s.user_id) ?? { best: 0, runs: 0 };
    byUser.set(s.user_id, {
      best: Math.max(current.best, s.score ?? 0),
      runs: current.runs + 1,
    });
  }

  // 24h-ago snapshot so we can show movement arrows.
  const previous = new Map<string, number>();
  if (period !== "today") {
    const cutoff = Date.now() - 86_400_000;
    const past = new Map<string, number>();
    for (const s of sessions ?? []) {
      if (new Date(s.created_at).getTime() > cutoff) continue;
      past.set(s.user_id, Math.max(past.get(s.user_id) ?? 0, s.score ?? 0));
    }
    [...past.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([id], i) => previous.set(id, i + 1));
  }

  const ids = [...byUser.keys()];
  if (ids.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, wallet_address, nickname, points")
    .in("id", ids);

  return [...byUser.entries()]
    .map(([userId, agg]) => {
      const profile = (profiles ?? []).find((p) => p.id === userId);
      return {
        userId,
        wallet: profile?.wallet_address ?? "0x0",
        nickname: profile?.nickname ?? null,
        points: profile?.points ?? 0,
        best: agg.best,
        runs: agg.runs,
        rank: 0,
        previousRank: previous.get(userId) ?? null,
      };
    })
    .sort((a, b) => b.best - a.best || b.runs - a.runs)
    .map((row, i) => ({ ...row, rank: i + 1 }));
}
