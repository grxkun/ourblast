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
  .inputValidator((d: { amountSol?: number | undefined } | undefined) => ({ amountSol: typeof d?.amountSol === "number" && Number.isFinite(d.amountSol) ? d.amountSol : undefined }))
  .handler(async ({ context, data }) => {
    const { bridgeSolNowForUser } = await import("./sol-sweep.server");
    return bridgeSolNowForUser(context.userId, data.amountSol);
  });

/** Review step before a SOL bridge: amount, what stays, destination. Moves nothing. */
export const previewSolBridge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { amountSol?: number | undefined } | undefined) => ({ amountSol: typeof d?.amountSol === "number" && Number.isFinite(d.amountSol) ? d.amountSol : undefined }))
  .handler(async ({ context, data }) => {
    const { previewSolBridgeForUser } = await import("./sol-sweep.server");
    return previewSolBridgeForUser(context.userId, data.amountSol);
  });
