// SPDX-License-Identifier: BUSL-1.1
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PUBLIC_ORIGIN = "https://ourblast.xyz";

/** Hosts a terminal-attached token picture; returns a short public URL for on-chain metadata. */
export const uploadTokenIcon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ dataUrl: z.string().max(1_500_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const m = /^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(data.dataUrl);
    if (!m) throw new Error("Unsupported image. Use PNG, JPG, GIF or WebP.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("token_icons" as never)
      .insert({ user_id: context.userId, mime: m[1], data: m[2] } as never)
      .select("id")
      .single();
    if (error || !row) throw new Error("Could not save the picture.");
    return { url: `${PUBLIC_ORIGIN}/api/public/icon/${(row as { id: string }).id}` };
  });
