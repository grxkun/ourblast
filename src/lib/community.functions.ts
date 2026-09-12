import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CHAT_DAILY_POINT_CAP, POINTS } from "./blast";

/** Points for chat participation, capped per day so it can't be farmed. */
export const awardChatPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { awardPoints, grantAchievement, today } = await import("./points.server");
    const day = today();

    const { count: todayCount } = await supabaseAdmin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", `${day}T00:00:00.000Z`);

    const n = todayCount ?? 0;
    let earned = 0;
    if (n <= CHAT_DAILY_POINT_CAP) {
      earned = await awardPoints(
        supabaseAdmin,
        userId,
        POINTS.chatMessage,
        "chat_message",
        `chat:${day}:${n}`,
      );
    }

    const { count: total } = await supabaseAdmin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((total ?? 0) >= 100) {
      const res = await grantAchievement(supabaseAdmin, userId, "chatterblast");
      earned += res.points;
    }

    return { pointsEarned: earned, cappedFor: n > CHAT_DAILY_POINT_CAP };
  });

const chatInput = z.object({
  body: z.string().trim().min(1).max(400),
  paymentId: z.string().uuid(),
});

const BLOCKED_WORDS = [
  "nigger",
  "faggot",
  "retard",
  "kike",
  "cunt",
  "rape",
  "paedo",
  "pedo",
  "kill yourself",
  "kys",
];

function cleanBody(body: string) {
  const lower = body.toLowerCase();
  if (BLOCKED_WORDS.some((w) => lower.includes(w))) {
    throw new Error("That message breaks the community rules.");
  }
  if (/(.)\1{9,}/.test(body)) throw new Error("Easy on the spam.");
  return body;
}

/**
 * Chat messages cost SUI. The paid transaction is verified and consumed here,
 * before the message is published — never the other way round.
 */
export const postChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => chatInput.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { consumePayment } = await import("./payments.server");
    const { awardPoints, grantAchievement, today } = await import("./points.server");
    const day = today();

    const [{ data: profile }, { count: lastMinute }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("is_banned, muted_until")
        .eq("id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", new Date(Date.now() - 60_000).toISOString()),
    ]);
    if (!profile) throw new Error("Profile not found.");
    if (profile.is_banned) throw new Error("This wallet is banned from OURBLAST.");
    if (profile.muted_until && new Date(profile.muted_until) > new Date()) {
      throw new Error("You're muted right now.");
    }

    const body = cleanBody(data.body.trim());

    if ((lastMinute ?? 0) >= 15) throw new Error("Slow down — too many messages.");

    const paymentId = await consumePayment(supabaseAdmin, data.paymentId, userId, "chat");

    const { error } = await supabaseAdmin
      .from("chat_messages")
      .insert({ user_id: userId, body, payment_id: paymentId });
    if (error) throw new Error(error.message);

    const [{ count: todayCount }, { count: total }] = await Promise.all([
      supabaseAdmin
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", `${day}T00:00:00.000Z`),
      supabaseAdmin
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);
    const n = (todayCount ?? 0) - 1;

    let earned = 0;
    if (n < CHAT_DAILY_POINT_CAP) {
      earned = await awardPoints(
        supabaseAdmin,
        userId,
        POINTS.chatMessage,
        "chat_message",
        `chat:${day}:${n}`,
      );
    }

    if ((total ?? 0) >= 100) {
      const res = await grantAchievement(supabaseAdmin, userId, "chatterblast");
      earned += res.points;
    }

    return { pointsEarned: earned, cappedFor: n >= CHAT_DAILY_POINT_CAP };
  });


const memeInput = z.object({
  title: z.string().trim().min(2).max(80),
  imageUrl: z.string().trim().url().max(600),
});

/** Submitted memes wait for moderation before they appear publicly. */
export const submitMeme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => memeInput.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { awardPoints, grantAchievement, today } = await import("./points.server");
    const day = today();

    const { count: todayCount } = await supabaseAdmin
      .from("memes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", `${day}T00:00:00.000Z`);
    if ((todayCount ?? 0) >= 5) throw new Error("You've hit today's meme submission limit.");

    const { error } = await supabaseAdmin.from("memes").insert({
      user_id: userId,
      title: data.title,
      image_url: data.imageUrl,
      status: "pending",
    });
    if (error) throw new Error("Could not save that meme.");

    let earned = await awardPoints(
      supabaseAdmin,
      userId,
      POINTS.memeSubmit,
      "meme_submit",
      `meme_submit:${day}:${todayCount ?? 0}`,
    );

    const { count: total } = await supabaseAdmin
      .from("memes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((total ?? 0) >= 5) {
      const res = await grantAchievement(supabaseAdmin, userId, "meme_warrior");
      earned += res.points;
    }

    return { pointsEarned: earned };
  });

const voteInput = z.object({ battleId: z.string().uuid(), memeId: z.string().uuid() });

export const voteMeme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => voteInput.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { awardPoints } = await import("./points.server");

    const { data: battle } = await supabaseAdmin
      .from("meme_battles")
      .select("id, meme_a, meme_b")
      .eq("id", data.battleId)
      .maybeSingle();
    if (!battle) throw new Error("That battle has ended.");
    if (battle.meme_a !== data.memeId && battle.meme_b !== data.memeId) {
      throw new Error("That meme isn't in this battle.");
    }

    const { error } = await supabaseAdmin
      .from("meme_votes")
      .insert({ battle_id: data.battleId, meme_id: data.memeId, user_id: userId });
    if (error) throw new Error("You already voted in today's battle.");

    const earned = await awardPoints(
      supabaseAdmin,
      userId,
      POINTS.memeVote,
      "meme_vote",
      `vote:${data.battleId}`,
    );
    return { pointsEarned: earned };
  });

/** Today's battle, created on demand from the approved meme pool. */
export const getTodaysBattle = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { today } = await import("./points.server");
  const day = today();

  let { data: battle } = await supabaseAdmin
    .from("meme_battles")
    .select("id, day, meme_a, meme_b, winner_id")
    .eq("day", day)
    .maybeSingle();

  if (!battle) {
    const { data: pool } = await supabaseAdmin
      .from("memes")
      .select("id")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(20);
    if (pool && pool.length >= 2) {
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      const { data: created } = await supabaseAdmin
        .from("meme_battles")
        .insert({ day, meme_a: shuffled[0]!.id, meme_b: shuffled[1]!.id })
        .select("id, day, meme_a, meme_b, winner_id")
        .maybeSingle();
      battle = created ?? null;
    }
  }
  if (!battle) return null;

  const { data: memes } = await supabaseAdmin
    .from("memes")
    .select("id, title, image_url, user_id")
    .in("id", [battle.meme_a, battle.meme_b]);

  const { data: votes } = await supabaseAdmin
    .from("meme_votes")
    .select("meme_id")
    .eq("battle_id", battle.id);

  const tally = (id: string) => (votes ?? []).filter((v) => v.meme_id === id).length;

  return {
    id: battle.id,
    day: battle.day,
    a: { ...(memes ?? []).find((m) => m.id === battle!.meme_a)!, votes: tally(battle.meme_a) },
    b: { ...(memes ?? []).find((m) => m.id === battle!.meme_b)!, votes: tally(battle.meme_b) },
  };
});

const roastInput = z.object({
  ticker: z.string().trim().min(1).max(16),
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).optional().default(""),
});

/** Playful AI roast. The API key lives on the server only. */
export const roastToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => roastInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("points_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .gte("created_at", new Date(Date.now() - 60_000).toISOString());
    if ((count ?? 0) > 40) throw new Error("Slow down, roast machine.");

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("The roast oven is offline right now.");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          {
            role: "system",
            content:
              "You are BLAST ROAST, a comedy bot for a crypto meme arcade. Roast the token concept in 3 to 5 short punchy lines, degen meme humour, emojis allowed. Rules: joke about the vibes, the ticker and the tropes only. Never make factual claims or accusations about real people, teams, scams, rugs or crimes. Never give financial or investment advice. Never mention prices or predictions. Keep it silly, never cruel about protected characteristics.",
          },
          {
            role: "user",
            content: `Ticker: $${data.ticker}\nName: ${data.name}\nDescription: ${data.description || "(none given)"}`,
          },
        ],
      }),
    });

    if (response.status === 429) throw new Error("Too many roasts at once — try again in a minute.");
    if (!response.ok) {
      console.error("roast failed", response.status, await response.text());
      throw new Error("The roast oven jammed. Try again.");
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const roast = payload.choices?.[0]?.message?.content?.trim();
    if (!roast) throw new Error("No roast came out. Try again.");
    return { roast };
  });
