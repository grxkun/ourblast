// SPDX-License-Identifier: BUSL-1.1
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/public/indexer")({
  server: { handlers: {
    POST: async ({ request }) => {
      const { indexerAuthorized } = await import("@/lib/tg/indexer-auth.server");
      const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
      if (!indexerAuthorized(supplied, [process.env["SUI_INDEXER_SECRET"], process.env["LOVABLE_CRON_SECRET"]])) return new Response("Forbidden", { status: 403 });
      const text = await request.text();
      if (text.length > 4096) return new Response("Request too large", { status: 413 });
      const schema = z.object({ source: z.enum(["main", "suipump-v17", "suipump-v18", "blast", "popular", "perpsplexity"]), before: z.string().min(1).max(2048).nullable().optional() }).strict();
      let input: unknown;
      try { input = JSON.parse(text); } catch { return new Response("Invalid JSON", { status: 400 }); }
      const parsed = schema.safeParse(input);
      if (!parsed.success) return new Response("Invalid source or cursor", { status: 400 });
      const { syncMarketSource } = await import("@/lib/tg/market-indexer.server");
      try { return Response.json(await syncMarketSource(parsed.data.source, parsed.data.before ?? null)); }
      catch { return Response.json({ error: "Indexing paused; retry this page. No trades were executed." }, { status: 503 }); }
    },
  } },
});