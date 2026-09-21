import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const simulateSchema = z.object({
  text: z.string().min(1).max(500),
  username: z.string().min(1).max(40).default("ourblast_tester"),
});

/** Dry-run a mention exactly as the X transport would handle it. */
export const simulateXMention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => simulateSchema.parse(input))
  .handler(async ({ data }) => {
    const { handleXMention } = await import("./x-bot.server");
    return handleXMention(
      { postId: `sim-${crypto.randomUUID()}`, username: data.username, text: data.text },
      "simulation",
    );
  });

/** Whether the bot can actually post replies (all four X credentials saved). */
export const getXBotStatus = createServerFn({ method: "GET" })
  .handler(async () => {
    const { xBotIsLive } = await import("./x-bot.server");
    return { live: xBotIsLive() };
  });

/**
 * Anyone can ask the bot to check @ourblastbot mentions right now instead of waiting
 * for the schedule. The poll is idempotent (one X post = one handled mention) and
 * returns only counts, so it is safe to keep open.
 */
export const pollXMentionsNow = createServerFn({ method: "POST" })
  .handler(async () => {
    const { runXMentionPoll } = await import("./x-poll.server");
    return runXMentionPoll();
  });

/**
 * Ingest one tweet by ID when X's mentions timeline skipped it. The tweet is
 * fetched server-side from X, so only real tweets can be processed; handling is
 * idempotent (one X post = one handled mention). Requires a signed-in user,
 * same as pressing Launch on a queued card.
 */
export const ingestXMentionById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ postId: z.string().regex(/^\d{5,25}$/) }).parse(input))
  .handler(async ({ data }) => {
    const { readXCredentials, fetchTweetDetails } = await import("./x-api.server");
    const credentials = readXCredentials();
    if (!credentials) throw new Error("X credentials not saved yet");
    const tweet = await fetchTweetDetails(credentials, data.postId);
    if (!tweet) throw new Error("Tweet not found on X");
    const { handleXMention } = await import("./x-bot.server");
    return handleXMention(
      { postId: tweet.id, username: tweet.username ?? "", text: tweet.text, imageUrl: tweet.imageUrl ?? null },
      "poll",
    );
  });
