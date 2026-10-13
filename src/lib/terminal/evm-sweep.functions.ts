// SPDX-License-Identifier: BUSL-1.1
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Manually bridges the caller's own OurBank EVM deposits (ETH/USDC) to Sui → $BLAST. */
export const bridgeNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { bridgeNowForUser } = await import("./evm-sweep.server");
    return bridgeNowForUser(context.userId);
  });
