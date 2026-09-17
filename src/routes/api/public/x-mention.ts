import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const payloadSchema = z.object({
  postId: z.string().min(1).max(80),
  username: z.string().min(1).max(40),
  text: z.string().min(1).max(1000),
});

const constantTimeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/**
 * Transport endpoint for "@ourblast launch $DOG Sui Dog" mentions.
 * Caller must present the shared X_BOT_WEBHOOK_SECRET; the reply is composed but
 * not posted while the bot runs in dry-run.
 */
export const Route = createFileRoute("/api/public/x-mention")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["X_BOT_WEBHOOK_SECRET"];
        if (!secret) return new Response("Not configured", { status: 503 });

        const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!provided || !constantTimeEqual(provided, secret)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let parsed;
        try {
          parsed = payloadSchema.parse(await request.json());
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const { handleXMention } = await import("@/lib/terminal/x-bot.server");
        const outcome = await handleXMention(parsed, "webhook");
        return Response.json(outcome);
      },
    },
  },
});
