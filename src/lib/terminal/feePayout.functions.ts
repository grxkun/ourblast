import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FEE_PAYOUT_MODES, normalizeFeePayout, type FeePayout } from "./feePayout";

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
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: link, error: linkError } = await supabaseAdmin
      .from("fee_claim_links")
      .select("token, launch_symbol, x_username, status")
      .eq("token", data.token)
      .maybeSingle();
    if (linkError) throw new Error(linkError.message);
    if (!link) return { ok: false as const, message: "This claim link does not exist." };

    const { data: account } = await supabaseAdmin
      .from("x_accounts")
      .select("username")
      .eq("user_id", context.userId)
      .maybeSingle();
    const viewerX = (account?.username ?? "").replace(/^@/, "");
    const reservedFor = (link.x_username ?? "").replace(/^@/, "");
    if (!viewerX) return { ok: false as const, message: "Sign in with X first so we can verify the handle." };
    if (viewerX.toLowerCase() !== reservedFor.toLowerCase()) {
      return { ok: false as const, message: `These fees are reserved for @${reservedFor}, not @${viewerX}.` };
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("wallet_address")
      .eq("id", context.userId)
      .maybeSingle();
    const wallet = (profile?.wallet_address ?? "").trim().toLowerCase();
    if (!/^0x[a-f0-9]{40,64}$/.test(wallet)) {
      return { ok: false as const, message: "Connect a Sui wallet to your OURBLAST account first." };
    }

    const { data: row, error } = await supabaseAdmin
      .from("fee_claim_links")
      .update({ status: "claimed", claimed_wallet: wallet, claimed_at: new Date().toISOString() })
      .eq("token", data.token)
      .eq("status", "pending")
      .select("token, launch_symbol, x_username, amount_sui, status, claimed_wallet")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { ok: false as const, message: "This claim link was already used or has expired." };

    // Remember the destination so this launcher's future launches pay them
    // straight on chain instead of parking the share again.
    await supabaseAdmin.from("launch_fee_payouts").upsert(
      {
        user_id: context.userId,
        launch_symbol: row.launch_symbol,
        launchpad: "suipump",
        mode: "wallet",
        destination_wallet: wallet,
        destination_x_username: reservedFor,
      },
      { onConflict: "user_id,launch_symbol" },
    );

    return {
      ok: true as const,
      message: `Verified. Your $${row.launch_symbol} creator share is routed to ${wallet.slice(0, 6)}…${wallet.slice(-4)}.`,
      claim: row,
    };
  });

export type { FeePayout };
