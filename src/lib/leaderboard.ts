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
  score: number;
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
 * Only paid, verified arcade runs belong on the public leaderboard. Older
 * demo sessions have no payment_id and are deliberately excluded here.
 */
export async function fetchLeaderboard(period: Period): Promise<LeaderRow[]> {
  let query = supabase
    .from("game_sessions")
    .select("user_id, score, created_at")
    .not("payment_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(4000);
  const from = since(period);
  if (from) query = query.gte("created_at", from);

  const { data: sessions, error } = await query;
  if (error) throw error;

  const byUser = new Map<string, { score: number; runs: number }>();
  for (const s of sessions ?? []) {
    const current = byUser.get(s.user_id);
    byUser.set(s.user_id, {
      score: current?.score ?? s.score ?? 0,
      runs: (current?.runs ?? 0) + 1,
    });
  }

  // 24h-ago snapshot so we can show movement arrows.
  const previous = new Map<string, number>();
  if (period !== "today") {
    const cutoff = Date.now() - 86_400_000;
    const past = new Map<string, number>();
    for (const s of sessions ?? []) {
      if (new Date(s.created_at).getTime() > cutoff) continue;
      if (!past.has(s.user_id)) past.set(s.user_id, s.score ?? 0);
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
        score: agg.score,
        runs: agg.runs,
        rank: 0,
        previousRank: previous.get(userId) ?? null,
      };
    })
    .sort((a, b) => b.score - a.score || b.runs - a.runs)
    .map((row, i) => ({ ...row, rank: i + 1 }));
}
