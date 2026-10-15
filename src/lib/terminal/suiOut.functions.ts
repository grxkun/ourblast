// SPDX-License-Identifier: BUSL-1.1
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Bridges SUI from the caller's OurBank Sui wallet to SOL on Solana. */
export const bridgeSuiOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { amountSui: number; target: string; destination?: string | undefined }) => {
    if (typeof d?.amountSui !== "number" || !Number.isFinite(d.amountSui) || d.amountSui <= 0) throw new Error("Invalid amount.");
    // Unknown targets are rejected, never silently turned into a different chain.
    if (!["SOL", "ETH_BASE", "ETH_ARB", "ETH_RH", "BNB"].includes(d.target)) throw new Error("Unsupported bridge target.");
    return { amountSui: d.amountSui, target: d.target as "SOL" | "ETH_BASE" | "ETH_ARB" | "ETH_RH" | "BNB", destination: typeof d.destination === "string" ? d.destination : undefined };
  })
  .handler(async ({ context, data }) => {
    const { bridgeSuiOutForUser } = await import("./suiOut.server");
    return bridgeSuiOutForUser(context.userId, data.amountSui, data.target, data.destination);
  });
