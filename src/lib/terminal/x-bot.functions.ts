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

/** TEMPORARY debug: raw view of what X returns for mentions and one tweet. */
export const debugXMentions = createServerFn({ method: "POST" })
  .handler(async () => {
    const { readXCredentials, getBotAccount, listMentions } = await import("./x-api.server");
    const credentials = readXCredentials();
    if (!credentials) return { ok: false, reason: "no creds" } as const;
    const bot = await getBotAccount(credentials);
    const all = await listMentions(credentials, bot.id, null);
    const fresh = await listMentions(credentials, bot.id, "2101820449571451091");
    return {
      ok: true,
      bot: bot.username,
      allIds: all.map((m) => m.id),
      freshIds: fresh.map((m) => ({ id: m.id, user: m.username, text: m.text.slice(0, 60) })),
    } as const;
  });
