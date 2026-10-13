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

/** Manually bridges the caller's own OurBank Solana deposits (SOL/USDC) to Sui → $BLAST. */
export const bridgeSolNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { bridgeSolNowForUser } = await import("./sol-sweep.server");
    return bridgeSolNowForUser(context.userId);
  });
