// SPDX-License-Identifier: BUSL-1.1
import { createFileRoute } from "@tanstack/react-router";

// VPS fast trigger: runs the same idempotent auto-snipe step as the poller (cursor + unique fill claims).
export const Route = createFileRoute("/api/public/snipe-trigger")({
  server: { handlers: {
    POST: async ({ request }) => {
      const { indexerAuthorized } = await import("@/lib/tg/indexer-auth.server");
      const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
      if (!indexerAuthorized(supplied, [process.env["SUI_INDEXER_SECRET"]])) return new Response("Forbidden", { status: 403 });
      const { maintainAutoSnipes } = await import("@/lib/tg/autoSnipe.server");
      try { await maintainAutoSnipes(); return Response.json({ ok: true }); }
      catch { return Response.json({ ok: false }, { status: 503 }); }
    },
  } },
});
