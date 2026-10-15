// SPDX-License-Identifier: BUSL-1.1
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** "launch $MOON on suipump with 0.1 sol": review only, nothing moves. Null = not a funded launch. */
export const stageFundedLaunchTerminal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ text: z.string().min(1).max(500), iconUrl: z.string().url().max(500).nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { stageFundedLaunchForUser } = await import("./fundedLaunch.server");
    return stageFundedLaunchForUser(context.userId, data.text, data.iconUrl ?? null);
  });

export const resolveFundedLaunchTerminal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), confirm: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { confirmFundedLaunch, cancelFundedLaunch } = await import("./fundedLaunch.server");
    if (!data.confirm) return { ok: true, message: (await cancelFundedLaunch(data.id, context.userId)) ? "Launch cancelled. Nothing moved." : "Nothing to cancel." };
    return confirmFundedLaunch(data.id, context.userId);
  });
