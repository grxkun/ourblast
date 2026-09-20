import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseAnon } from "../supabase";

export default defineTool({
  name: "get_leaderboard",
  title: "Get arcade leaderboard",
  description: "Get the OurBlast arcade leaderboard: top community members by points, with games played and best score.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(10).describe("How many players to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }) => {
    const supabase = supabaseAnon();
    const { data, error } = await supabase
      .from("profiles")
      .select("nickname, display_name, points, games_played, best_score, streak")
      .eq("is_banned", false)
      .order("points", { ascending: false })
      .limit(limit);
    if (error) throw new ToolError(error.message);

    const players = (data ?? []).map((row, index) => ({
      rank: index + 1,
      name: row.display_name ?? row.nickname ?? "Anonymous",
      points: row.points ?? 0,
      gamesPlayed: row.games_played ?? 0,
      bestScore: row.best_score ?? 0,
      streak: row.streak ?? 0,
    }));

    const text = players.length
      ? players.map((p) => `${p.rank}. ${p.name} — ${p.points} points`).join("\n")
      : "No players on the leaderboard yet.";

    return { content: [{ type: "text", text }], structuredContent: { players } };
  },
});
