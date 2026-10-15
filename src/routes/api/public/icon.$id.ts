import { createFileRoute } from "@tanstack/react-router";

/** Public token picture (read-only, by unguessable id). */
export const Route = createFileRoute("/api/public/icon/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new Response("Not found", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("token_icons" as never)
          .select("mime, data")
          .eq("id", params.id)
          .maybeSingle();
        const row = data as { mime: string; data: string } | null;
        if (!row) return new Response("Not found", { status: 404 });
        const bytes = Uint8Array.from(atob(row.data), (c) => c.charCodeAt(0));
        return new Response(bytes, {
          headers: { "content-type": row.mime, "cache-control": "public, max-age=31536000, immutable" },
        });
      },
    },
  },
});
