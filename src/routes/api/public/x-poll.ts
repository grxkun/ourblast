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
        let mismatch = provided.length === secret.length ? 0 : 1;
        for (let index = 0; index < Math.max(provided.length, secret.length); index += 1) {
          mismatch |= (provided.charCodeAt(index) || 0) ^ (secret.charCodeAt(index) || 0);
        }
        if (mismatch !== 0) return new Response("Unauthorized", { status: 401 });

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
        let mentions;
        try {
          if (!botUserId) botUserId = (await getBotAccount(credentials)).id;
          mentions = await listMentions(credentials, botUserId, state?.last_mention_id ?? null);
        } catch (error) {
          const message = error instanceof Error ? error.message : "X read failed";
          // A 402/429 from X is an account-plan or rate issue, not a bug: report it plainly.
          console.error(`X mention poll failed: ${message}`);
          return Response.json(
            { live: true, handled: 0, error: message.slice(0, 500) },
            { status: 200 },
          );
        }
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

        // Someone may have created the token by hand on Suipump: confirm it on chain
        // and reply with the real token link, without ever guessing.
        let confirmed = 0;
        const { confirmSuipumpLaunch } = await import("@/lib/terminal/xLauncher.server");
        const { data: open } = await supabaseAdmin
          .from("x_launch_requests")
          .select("id")
          .eq("launchpad", "suipump")
          .in("status", ["PENDING", "UNAVAILABLE"])
          .gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString())
          .limit(20);
        for (const pending of open ?? []) {
          try {
            const outcome = await confirmSuipumpLaunch(pending.id);
            if (outcome.status === "DEPLOYED") confirmed += 1;
          } catch (error) {
            console.error(`Suipump confirm failed: ${error instanceof Error ? error.message : "unknown"}`);
          }
        }

        return Response.json({ live: true, handled: handled.length, confirmed, lastMentionId: newest });
      },
    },
  },
});
