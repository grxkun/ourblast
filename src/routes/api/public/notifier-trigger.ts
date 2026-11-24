// SPDX-License-Identifier: BUSL-1.1
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/notifier-trigger")({
  server: { handlers: { POST: async ({ request }) => {
    const { indexerAuthorized } = await import("@/lib/tg/indexer-auth.server");
    if (!indexerAuthorized(request.headers.get("authorization")?.replace(/^Bearer /, "") ?? null, [process.env["SUI_INDEXER_SECRET"]])) return new Response("Forbidden", { status: 403 });
    const { maintainChannelSignals } = await import("@/lib/tg/notifierSignals.server");
    try { await maintainChannelSignals(); return Response.json({ ok: true }); }
    catch { return Response.json({ ok: false }, { status: 503 }); }
  } } },
});