// SPDX-License-Identifier: BUSL-1.1
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getLaunchAdvice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ text: z.string().min(1).max(500), history: z.array(z.object({ who: z.enum(["me", "bot"]), text: z.string().max(4000) })).max(6).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { launchAdvice } = await import("./advisor.server");
    return { reply: await launchAdvice(data.text, data.history) };
  });