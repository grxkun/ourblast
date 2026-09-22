import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FEE_PAYOUT_MODES, normalizeFeePayout, type FeePayout } from "./feePayout";
import { performClaim, readClaimViewer, type ClaimStore } from "./claimFlow";

const payoutSchema = z.object({
  symbol: z.string().min(1).max(10),
  launchpad: z.string().min(1).max(64),
  mode: z.enum(FEE_PAYOUT_MODES),
  wallet: z.string().max(80).nullable().optional(),
  xUsername: z.string().max(20).nullable().optional(),
});

/** Saves the creator's payout choice for one token. Destination is re-validated server-side. */
export const saveLaunchFeePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => payoutSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { payout, notes } = normalizeFeePayout({
      mode: data.mode,
      wallet: data.wallet ?? null,
      xUsername: data.xUsername ?? null,
    });
    const { error } = await context.supabase
      .from("launch_fee_payouts")
      .upsert(
        {
          user_id: context.userId,
          launch_symbol: data.symbol.toUpperCase(),
          launchpad: data.launchpad,
          mode: payout.mode,
          destination_wallet: payout.wallet,
          destination_x_username: payout.xUsername,
        },
        { onConflict: "user_id,launch_symbol" },
      );
    if (error) throw new Error(error.message);
    return { payout, notes };
  });

export const getLaunchFeePayouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("launch_fee_payouts")
      .select("launch_symbol, launchpad, mode, destination_wallet, destination_x_username, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const claimLinkSchema = z.object({
  symbol: z.string().min(1).max(10),
  xUsername: z.string().min(1).max(20),
  amountSui: z.number().min(0).max(1_000_000).default(0),
});

function claimToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Creates the one-time claim link an X account uses to pull its parked creator fees. */
export const createFeeClaimLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => claimLinkSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { payout } = normalizeFeePayout({ mode: "x", wallet: null, xUsername: data.xUsername });
    if (payout.mode !== "x" || !payout.xUsername) throw new Error("That X handle is not usable.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = claimToken();
    const { error } = await supabaseAdmin.from("fee_claim_links").insert({
      token,
      launch_symbol: data.symbol.toUpperCase(),
      x_username: payout.xUsername,
      amount_sui: data.amountSui,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { token, path: `/claim/${token}`, xUsername: payout.xUsername };
  });

/** Public read of a claim link so the recipient can open it without an account. */
export const getFeeClaim = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(8).max(64) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("fee_claim_links")
      .select("token, launch_symbol, x_username, amount_sui, status, claimed_wallet, claimed_at")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? null;
  });

/** Supabase-backed store for the shared claim-flow logic in claimFlow.ts. */
async function claimStore(): Promise<ClaimStore> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return {
    async getLink(token) {
      const { data, error } = await supabaseAdmin
        .from("fee_claim_links")
        .select("token, launch_symbol, x_username, status, amount_sui, claimed_wallet")
        .eq("token", token)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    },
    async getXUsername(userId) {
      const { data } = await supabaseAdmin
        .from("x_accounts")
        .select("username")
        .eq("user_id", userId)
        .maybeSingle();
      return data?.username ?? null;
    },
    async getWallet(userId) {
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("wallet_address")
        .eq("id", userId)
        .maybeSingle();
      return data?.wallet_address ?? null;
    },
    async markClaimed(token, wallet) {
      const { data, error } = await supabaseAdmin
        .from("fee_claim_links")
        .update({ status: "claimed", claimed_wallet: wallet, claimed_at: new Date().toISOString() })
        .eq("token", token)
        .eq("status", "pending")
        .select("token, launch_symbol, x_username, amount_sui, status, claimed_wallet")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    },
    async rememberPayout({ userId, symbol, wallet, xUsername }) {
      await supabaseAdmin.from("launch_fee_payouts").upsert(
        {
          user_id: userId,
          launch_symbol: symbol,
          launchpad: "suipump",
          mode: "wallet",
          destination_wallet: wallet,
          destination_x_username: xUsername,
        },
        { onConflict: "user_id,launch_symbol" },
      );
    },
  };
}

/**
 * What the signed-in visitor of a claim page has in place: the X account they
 * signed in with and the Sui wallet on their profile. Both must be present and
 * the X handle must match the handle the fees were reserved for.
 */
export const getClaimViewer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ token: z.string().min(8).max(64) }).parse(input))
  .handler(async ({ data, context }) =>
    readClaimViewer(await claimStore(), context.userId, data.token),
  );

/**
 * Records which wallet claimed the reserved launcher share. Only the X account
 * the fees were reserved for can claim, and only into the wallet linked to that
 * same OURBLAST profile — the link alone is never enough.
 */
export const claimFeeLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ token: z.string().min(8).max(64) }).parse(input))
  .handler(async ({ data, context }) =>
    performClaim(await claimStore(), context.userId, data.token),
  );

export type { FeePayout };
