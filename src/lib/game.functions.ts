import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DIFFICULTIES, POINTS } from "./blast";

const scoreInput = z.object({
  score: z.number().int().min(0).max(60_000),
  clicks: z.number().int().min(0).max(600),
  maxCombo: z.number().int().min(1).max(20),
  difficulty: z.enum(["easy", "normal", "hard"]).default("normal"),
  durationMs: z.number().int().min(20_000).max(40_000),
  paymentId: z.string().uuid(),
  gameKey: z.string().min(2).max(40).default("blast_click"),
});

/**
 * Gameplay runs client-side for the MVP; the final result is validated here
 * before any points are written. Score bounds and per-hour caps stop the
 * obvious cheats. A verified on-chain submission can slot in behind this same
 * boundary later without touching the UI.
 */
export const submitScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => scoreInput.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { awardPoints, grantAchievement, today } = await import("./points.server");
    const { consumePayment, currentSeasonId } = await import("./payments.server");

    const tier = DIFFICULTIES[data.difficulty];
    const maxPlausible = Math.ceil(data.clicks * 10 * tier.maxCombo * tier.multiplier);
    if (data.score > maxPlausible) throw new Error("Score rejected: impossible for that many clicks.");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("games_played, best_score, is_banned")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) throw new Error("Profile not found.");
    if (profile.is_banned) throw new Error("This wallet is banned from OURBLAST.");

    const { count: recent } = await supabaseAdmin
      .from("game_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
    if ((recent ?? 0) >= 30) throw new Error("Take a breather — too many runs this hour.");

    // The paid entry ticket is verified and spent here — one run per payment.
    const paymentId = await consumePayment(supabaseAdmin, data.paymentId, userId, "game");
    const seasonId = await currentSeasonId(supabaseAdmin);

    await supabaseAdmin.from("game_sessions").insert({
      user_id: userId,
      game_key: data.gameKey,
      score: data.score,
      clicks: data.clicks,
      max_combo: data.maxCombo,
      duration_ms: data.durationMs,
      payment_id: paymentId,
      season_id: seasonId,
    });

    const isPersonalBest = data.score > (profile.best_score ?? 0);
    await supabaseAdmin
      .from("profiles")
      .update({
        games_played: (profile.games_played ?? 0) + 1,
        best_score: Math.max(profile.best_score ?? 0, data.score),
      })
      .eq("id", userId);

    // Reward = flat entry reward scaled by the tier you chose, plus a small
    // skill bonus so a great run on Chill still loses to a great run on Hard.
    const runReward = Math.round(POINTS.playGame * tier.multiplier);
    const skillBonus = Math.min(POINTS.skillBonusCap, Math.floor(data.score / 100));
    let earned = await awardPoints(supabaseAdmin, userId, runReward, "play_game");
    if (skillBonus > 0) {
      earned += await awardPoints(supabaseAdmin, userId, skillBonus, "skill_bonus");
    }
    if (isPersonalBest && data.score > 0) {
      earned += await awardPoints(
        supabaseAdmin,
        userId,
        Math.round(POINTS.highScore * tier.multiplier),
        "high_score",
      );
    }

    const newAchievements: string[] = [];
    const first = await grantAchievement(supabaseAdmin, userId, "first_blast");
    if (first.granted) {
      newAchievements.push("first_blast");
      earned += first.points;
    }
    if (data.score >= 8000) {
      const master = await grantAchievement(supabaseAdmin, userId, "arcade_master");
      if (master.granted) {
        newAchievements.push("arcade_master");
        earned += master.points;
      }
    }

    // Daily challenge progress
    let challengeCompleted = false;
    const { data: challenge } = await supabaseAdmin
      .from("daily_challenges")
      .select("id, target, reward_points")
      .eq("day", today())
      .maybeSingle();
    if (challenge) {
      const { data: entry } = await supabaseAdmin
        .from("challenge_entries")
        .select("id, score")
        .eq("challenge_id", challenge.id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!entry) {
        await supabaseAdmin
          .from("challenge_entries")
          .insert({ challenge_id: challenge.id, user_id: userId, score: data.clicks });
      } else if (data.clicks > (entry.score ?? 0)) {
        await supabaseAdmin.from("challenge_entries").update({ score: data.clicks }).eq("id", entry.id);
      }
      if (data.clicks >= challenge.target) {
        const gained = await awardPoints(
          supabaseAdmin,
          userId,
          challenge.reward_points ?? POINTS.dailyChallenge,
          "daily_challenge",
          `challenge:${challenge.id}`,
        );
        earned += gained;
        challengeCompleted = gained > 0;
      }
    }

    const { count: better } = await supabaseAdmin
      .from("game_sessions")
      .select("id", { count: "exact", head: true })
      .gt("score", data.score);

    return {
      rank: (better ?? 0) + 1,
      pointsEarned: earned,
      isPersonalBest,
      challengeCompleted,
      newAchievements,
    };
  });
