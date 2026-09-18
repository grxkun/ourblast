import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const simulateSchema = z.object({
  text: z.string().min(1).max(500),
  username: z.string().min(1).max(40).default("ourblast_tester"),
});

/** Dry-run a mention exactly as the X transport would handle it. */
export const simulateXMention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => simulateSchema.parse(input))
  .handler(async ({ data }) => {
    const { handleXMention } = await import("./x-bot.server");
    return handleXMention(
      { postId: `sim-${crypto.randomUUID()}`, username: data.username, text: data.text },
      "simulation",
    );
  });

/** Whether the bot can actually post replies (all four X credentials saved). */
export const getXBotStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { xBotIsLive } = await import("./x-bot.server");
    return { live: xBotIsLive() };
  });
