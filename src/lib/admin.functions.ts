import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertStaff(context: any) {
  const { data, error } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (error || !data) throw new Error("Admins only.");
  return context.userId as string;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function logAction(
  actorId: string,
  action: string,
  opts: { targetUserId?: string | null; targetRef?: string | null; reason?: string | null },
) {
  const db = await admin();
  await db.from("moderation_actions").insert({
    actor_id: actorId,
    action,
    target_user_id: opts.targetUserId ?? null,
    target_ref: opts.targetRef ?? null,
    reason: opts.reason ?? null,
  });
}

export const amIStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { staff: Boolean(data), admin: Boolean(isAdmin) };
  });

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const db = await admin();
    const [players, sessions, memes, messages, actions] = await Promise.all([
      db
        .from("profiles")
        .select("id, wallet_address, nickname, points, games_played, best_score, streak, is_banned, muted_until, created_at")
        .order("points", { ascending: false })
        .limit(100),
      db
        .from("game_sessions")
        .select("id, user_id, score, clicks, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("memes")
        .select("id, user_id, title, image_url, status, created_at")
        .order("created_at", { ascending: false })
        .limit(60),
      db
        .from("chat_messages")
        .select("id, user_id, body, is_deleted, created_at")
        .order("created_at", { ascending: false })
        .limit(60),
      db
        .from("moderation_actions")
        .select("id, actor_id, action, target_user_id, target_ref, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(40),
    ]);
    return {
      players: players.data ?? [],
      sessions: sessions.data ?? [],
      memes: memes.data ?? [],
      messages: messages.data ?? [],
      actions: actions.data ?? [],
    };
  });

export const adjustPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        amount: z.number().int().min(-1_000_000).max(1_000_000),
        reason: z.string().trim().min(3).max(160),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const actor = await assertStaff(context);
    const db = await admin();
    const { awardPoints } = await import("./points.server");
    await awardPoints(db, data.userId, data.amount, `manual:${data.reason}`, undefined, actor);
    await logAction(actor, `points_adjust:${data.amount}`, {
      targetUserId: data.userId,
      reason: data.reason,
    });
    return { ok: true };
  });

export const setBanned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        banned: z.boolean(),
        reason: z.string().trim().max(160).optional().default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const actor = await assertStaff(context);
    const db = await admin();
    await db.from("profiles").update({ is_banned: data.banned }).eq("id", data.userId);
    await logAction(actor, data.banned ? "ban" : "unban", {
      targetUserId: data.userId,
      reason: data.reason,
    });
    return { ok: true };
  });

export const setMuted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), minutes: z.number().int().min(0).max(20_160) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const actor = await assertStaff(context);
    const db = await admin();
    const until = data.minutes > 0 ? new Date(Date.now() + data.minutes * 60_000).toISOString() : null;
    await db.from("profiles").update({ muted_until: until }).eq("id", data.userId);
    await logAction(actor, data.minutes > 0 ? `mute:${data.minutes}m` : "unmute", {
      targetUserId: data.userId,
    });
    return { ok: true };
  });

export const hideMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ messageId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const actor = await assertStaff(context);
    const db = await admin();
    await db.from("chat_messages").update({ is_deleted: true }).eq("id", data.messageId);
    await logAction(actor, "chat_hide", { targetRef: data.messageId });
    return { ok: true };
  });

export const reviewMeme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ memeId: z.string().uuid(), status: z.enum(["approved", "rejected"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const actor = await assertStaff(context);
    const db = await admin();
    await db
      .from("memes")
      .update({ status: data.status, reviewed_by: actor })
      .eq("id", data.memeId);
    await logAction(actor, `meme_${data.status}`, { targetRef: data.memeId });
    return { ok: true };
  });

export const upsertChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(4).max(120),
        description: z.string().trim().min(4).max(400),
        target: z.number().int().min(1).max(500),
        rewardPoints: z.number().int().min(0).max(10_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const actor = await assertStaff(context);
    const db = await admin();
    const day = new Date().toISOString().slice(0, 10);
    await db
      .from("daily_challenges")
      .upsert(
        {
          day,
          title: data.title,
          description: data.description,
          target: data.target,
          reward_points: data.rewardPoints,
        },
        { onConflict: "day" },
      );
    await logAction(actor, "challenge_update", { reason: data.title });
    return { ok: true };
  });
