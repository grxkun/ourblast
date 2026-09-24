import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Reads the caller's own role rows through their RLS-scoped client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function myRoles(context: any): Promise<string[]> {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  return ((data ?? []) as { role: string }[]).map((r) => r.role);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertStaff(context: any) {
  const roles = await myRoles(context);
  if (!roles.includes("admin") && !roles.includes("moderator")) throw new Error("Admins only.");
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
    const roles = await myRoles(context);
    return {
      staff: roles.includes("admin") || roles.includes("moderator"),
      admin: roles.includes("admin"),
    };
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

export const botHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const db = await admin();
    const [state, failedReplies, recentMentions] = await Promise.all([
      db
        .from("x_bot_state")
        .select(
          "updated_at, last_mention_id, last_poll_success_at, last_search_success_at, last_reply_success_at, last_poll_error",
        )
        .eq("id", true)
        .maybeSingle(),
      db
        .from("x_mentions")
        .select("id", { count: "exact", head: true })
        .eq("posted", false)
        .not("post_error", "is", null)
        .not("x_post_id", "like", "test-%")
        .not("x_post_id", "like", "sim-%")
        .gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString()),
      db
        .from("x_mentions")
        .select("id", { count: "exact", head: true })
        .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString()),
    ]);
    return {
      state: state.data ?? null,
      pendingFailedReplies: failedReplies.count ?? 0,
      mentionsLast24h: recentMentions.count ?? 0,
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

export const listSwapTweetsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const { listSwapTweets } = await import("@/lib/terminal/bank.server");
    return listSwapTweets();
  });

export const runSwapTweetAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ postId: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ context, data }) => {
    const actor = await assertStaff(context);
    const { runSwapFromTweet } = await import("@/lib/terminal/bank.server");
    const result = await runSwapFromTweet(data.postId);
    await logAction(actor, "run_swap_tweet", { targetRef: data.postId, reason: result.reply.slice(0, 200) });
    return result;
  });

export const listSwapAttemptsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("bank_swaps")
      .select("id, x_post_id, x_username, side, coin_in, coin_out, amount_in, quoted_out, status, tx_digest, error, created_at, updated_at")
      .order("created_at", { ascending: false }).limit(40);
    const rows = data ?? [];
    const chain = new Map<string, { state: string; error: string | null }>();
    await Promise.all(rows.filter((r) => r.tx_digest).map(async (r) => {
      try {
        const res = await fetch("https://rpc-mainnet.suiscan.xyz", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sui_getTransactionBlock", params: [r.tx_digest, { showEffects: true }] }),
          signal: AbortSignal.timeout(5000),
        });
        const j = await res.json() as { result?: { effects?: { status?: { status?: string; error?: string } } }; error?: { message?: string } };
        const st = j.result?.effects?.status;
        chain.set(r.id, st ? { state: st.status === "success" ? "CONFIRMED" : "CHAIN FAILED", error: st.error ?? null }
          : { state: "NOT FOUND ON CHAIN", error: j.error?.message ?? null });
      } catch { chain.set(r.id, { state: "CHECK UNAVAILABLE", error: null }); }
    }));
    return rows.map((r) => ({ ...r, chain: chain.get(r.id) ?? { state: "NO DIGEST", error: null } }));
  });
