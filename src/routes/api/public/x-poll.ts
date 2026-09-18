import { createFileRoute } from "@tanstack/react-router";

/**
 * Polls @ourblastbot mentions and answers each new launch call exactly once.
 * Call on a schedule with: Authorization: Bearer <X_BOT_WEBHOOK_SECRET>.
 */
export const Route = createFileRoute("/api/public/x-poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["X_BOT_WEBHOOK_SECRET"];
        if (!secret) return new Response("Poller not configured", { status: 503 });

        const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        const expected = new TextEncoder().encode(secret);
        const actual = new TextEncoder().encode(provided);
        if (actual.length !== expected.length || !crypto.subtle.timingSafeEqual?.(actual, expected)) {
          if (provided !== secret) return new Response("Unauthorized", { status: 401 });
        }

        const { readXCredentials, getBotAccount, listMentions } = await import("@/lib/terminal/x-api.server");
        const credentials = readXCredentials();
        if (!credentials) return Response.json({ live: false, handled: 0, reason: "X credentials not saved yet" });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: state } = await supabaseAdmin
          .from("x_bot_state")
          .select("last_mention_id, bot_user_id")
          .eq("id", true)
          .maybeSingle();

        let botUserId = state?.bot_user_id ?? null;
        if (!botUserId) botUserId = (await getBotAccount(credentials)).id;

        const mentions = await listMentions(credentials, botUserId, state?.last_mention_id ?? null);
        const { handleXMention } = await import("@/lib/terminal/x-bot.server");

        const handled: string[] = [];
        for (const mention of mentions) {
          const { data: seen } = await supabaseAdmin
            .from("x_mentions")
            .select("id")
            .eq("x_post_id", mention.id)
            .maybeSingle();
          if (seen) continue;

          await handleXMention(
            { postId: mention.id, username: mention.username ?? "", text: mention.text },
            "poll",
          );
          handled.push(mention.id);
        }

        const newest = mentions.at(-1)?.id ?? state?.last_mention_id ?? null;
        await supabaseAdmin
          .from("x_bot_state")
          .update({ last_mention_id: newest, bot_user_id: botUserId, updated_at: new Date().toISOString() })
          .eq("id", true);

        return Response.json({ live: true, handled: handled.length, lastMentionId: newest });
      },
    },
  },
});
