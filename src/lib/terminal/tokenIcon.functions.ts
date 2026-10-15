// SPDX-License-Identifier: BUSL-1.1
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PUBLIC_ORIGIN = "https://ourblast.xyz";
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/gif": "gif", "image/webp": "webp" };

/** Hosts a terminal-attached token picture; returns a short public URL for on-chain metadata. */
export const uploadTokenIcon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ dataUrl: z.string().max(3_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const m = /^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(data.dataUrl);
    if (!m || !m[1] || !m[2]) throw new Error("Unsupported image. Use PNG, JPG, GIF or WebP.");
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    const name = `${crypto.randomUUID()}.${EXT[m[1]] ?? "png"}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage.from("token-icons").upload(`${context.userId}/${name}`, bytes, { contentType: m[1] });
    if (error) throw new Error("Could not save the picture.");
    return { url: `${PUBLIC_ORIGIN}/api/public/icon/${context.userId}/${name}` };
  });
