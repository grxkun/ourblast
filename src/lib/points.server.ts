import type { SupabaseClient } from "@supabase/supabase-js";

/** Server-only reward helpers. Points are only ever written here. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

export async function awardPoints(
  admin: Admin,
  userId: string,
  amount: number,
  reason: string,
  dedupeKey?: string,
  actorId?: string,
): Promise<number> {
  const { data, error } = await admin.rpc("award_points", {
    _user_id: userId,
    _amount: amount,
    _reason: reason,
    _dedupe_key: dedupeKey ?? null,
    _actor_id: actorId ?? null,
  });
  if (error) {
    console.error("award_points failed", error.message);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

export async function grantAchievement(
  admin: Admin,
  userId: string,
  key: string,
): Promise<{ granted: boolean; points: number }> {
  const { data: existing } = await admin
    .from("user_achievements")
    .select("id")
    .eq("user_id", userId)
    .eq("achievement_key", key)
    .maybeSingle();
  if (existing) return { granted: false, points: 0 };

  const { error } = await admin
    .from("user_achievements")
    .insert({ user_id: userId, achievement_key: key });
  if (error) return { granted: false, points: 0 };

  const { data: achievement } = await admin
    .from("achievements")
    .select("reward_points")
    .eq("key", key)
    .maybeSingle();

  const reward = achievement?.reward_points ?? 1000;
  const points = await awardPoints(admin, userId, reward, `achievement:${key}`, `achievement:${key}`);
  return { granted: true, points };
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}
