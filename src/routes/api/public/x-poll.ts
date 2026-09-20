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

        const { runXMentionPoll } = await import("@/lib/terminal/x-poll.server");
        return Response.json(await runXMentionPoll());
      },
    },
  },
});
