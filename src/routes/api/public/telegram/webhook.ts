// SPDX-License-Identifier: BUSL-1.1
import { createFileRoute } from "@tanstack/react-router";
import { telegramUpdateSchema } from "@/lib/tg/webhookDelivery";

async function webhookSecret(token: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`telegram-webhook:${token}`));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["TELEGRAM_BOT_TOKEN"];
        if (!token) return new Response("Not configured", { status: 503 });
        const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (got !== (await webhookSecret(token))) return new Response("Unauthorized", { status: 401 });
        const parsed = telegramUpdateSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid update", { status: 400 });
        const { enqueueTelegramUpdate, processQueuedTelegramUpdate } = await import("@/lib/tg/webhookQueue.server");
        let result: "queued" | "ignored";
        try { result = await enqueueTelegramUpdate(parsed.data); }
        catch { return new Response("Could not save update", { status: 503 }); }
        // Nitro attaches the platform execution context to Request in production.
        // With no background context, the durable queue is drained by the poller.
        const backgroundRequest = request as Request & { waitUntil?: (work: Promise<unknown>) => void };
        if (result === "queued" && backgroundRequest.waitUntil) {
          backgroundRequest.waitUntil(processQueuedTelegramUpdate(`update:${parsed.data.update_id}`, token).catch(() => {
            console.error("Telegram background processing interrupted");
          }));
        }
        return Response.json({ ok: true });
      },
    },
  },
});
