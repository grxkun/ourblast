// SPDX-License-Identifier: BUSL-1.1
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Public token lookup on Suipump — read-only, safe for anyone. */
export const lookupSuipumpToken = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ query: z.string().min(1).max(120) }).parse(input))
  .handler(async ({ data }) => {
    const { findSuipumpToken } = await import("./suipump.server");
    try {
      return { token: await findSuipumpToken(data.query) };
    } catch {
      return { token: null };
    }
  });

/**
 * "I launched it on Suipump" — verifies the token exists before anything is
 * ever described as deployed.
 */
export const checkSuipumpLaunch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { confirmSuipumpLaunch } = await import("./xLauncher.server");
    return confirmSuipumpLaunch(data.requestId);
  });
