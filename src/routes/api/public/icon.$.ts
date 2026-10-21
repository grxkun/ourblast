// SPDX-License-Identifier: BUSL-1.1
import { createFileRoute } from "@tanstack/react-router";

/** Public token picture: /api/public/icon/<userId>/<uuid>.<ext> (read-only, unguessable path). */
export const Route = createFileRoute("/api/public/icon/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = params._splat ?? "";
        if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|gif|webp)$/i.test(path)) return new Response("Not found", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin.storage.from("token-icons").download(path);
        if (!data) return new Response("Not found", { status: 404 });
        return new Response(data, {
          headers: { "content-type": data.type || "image/png", "cache-control": "public, max-age=31536000, immutable" },
        });
      },
    },
  },
});
