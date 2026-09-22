import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  canChangeRecipientAfterDeploy,
  normalizeDesignation,
  recipientLockedNote,
} from "./creatorFee";

const designationSchema = z.object({
  tokenAddress: z.string().min(4).max(120),
  tokenSymbol: z.string().min(1).max(12),
  tokenName: z.string().max(64).nullable().optional(),
  launchpad: z.string().max(40).nullable().optional(),
  recipientWallet: z.string().min(10).max(80),
  recipientName: z.string().max(64).nullable().optional(),
  recipientXHandle: z.string().max(20).nullable().optional(),
  designationTx: z.string().max(120).nullable().optional(),
  authorized: z.boolean(),
});

/**
 * Records a creator-fee designation for one token. The deployer must confirm the
 * authorization, and an existing designation can only be replaced when the pad's
 * protocol actually supports changing the fee recipient after deployment.
 */
export const designateCreatorFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => designationSchema.parse(input))
  .handler(async ({ data, context }) => {
    const clean = normalizeDesignation({ ...data, authorized: data.authorized });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("creator_fee_designations")
      .select("id, recipient_wallet, launchpad, deployer_user_id")
      .eq("token_address", clean.tokenAddress)
      .maybeSingle();

    if (existing) {
      if (!canChangeRecipientAfterDeploy(existing.launchpad)) {
        throw new Error(recipientLockedNote(existing.launchpad));
      }
      if (existing.deployer_user_id !== context.userId) {
        throw new Error("Only the deployer who created this designation can change it.");
      }
    }

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("wallet_address")
      .eq("id", context.userId)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("creator_fee_designations").upsert(
      {
        token_address: clean.tokenAddress,
        chain: "sui",
        launchpad: clean.launchpad,
        token_symbol: clean.tokenSymbol,
        token_name: clean.tokenName,
        deployer_user_id: context.userId,
        deployer_wallet: profile?.wallet_address ?? null,
        recipient_wallet: clean.recipientWallet,
        recipient_name: clean.recipientName,
        recipient_x_handle: clean.recipientXHandle,
        authorized: true,
        designation_tx: data.designationTx ?? null,
        status: "designated",
      },
      { onConflict: "token_address" },
    );
    if (error) throw new Error(error.message);

    return { ok: true, tokenAddress: clean.tokenAddress, claimPath: `/claim/${clean.tokenAddress}` };
  });

/** Designations created by the signed-in deployer. */
export const getMyDesignations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("creator_fee_designations")
      .select("*")
      .eq("deployer_user_id", context.userId)
      .order("designated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/**
 * The recipient claims a designation. OURBLAST holds no funds: claiming proves
 * the recipient controls the designated wallet and records it on the public
 * record, so the pad's on-chain payouts are acknowledged as received.
 */
export const claimCreatorFeeDesignation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ tokenAddress: z.string().min(4).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const tokenAddress = data.tokenAddress.trim().toLowerCase();
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("wallet_address")
      .eq("id", context.userId)
      .maybeSingle();
    const wallet = profile?.wallet_address?.toLowerCase() ?? null;
    if (!wallet) return { ok: false, message: "Connect the designated Sui wallet first." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("creator_fee_designations")
      .select("recipient_wallet, status, unclaimed_amount, designation_tx")
      .eq("token_address", tokenAddress)
      .maybeSingle();
    if (!row) return { ok: false, message: "No designation exists for that token." };
    if (row.status === "claimed") return { ok: false, message: "This designation was already claimed." };
    if (row.recipient_wallet.toLowerCase() !== wallet) {
      return {
        ok: false,
        message: "The connected wallet is not the designated recipient wallet for this token.",
      };
    }

    const { data: updated, error } = await supabaseAdmin
      .from("creator_fee_designations")
      .update({
        status: "claimed",
        claimed_wallet: wallet,
        claimed_at: new Date().toISOString(),
        claimed_amount: Number(row.unclaimed_amount ?? 0),
        unclaimed_amount: 0,
        claim_tx: row.designation_tx ?? null,
      })
      .eq("token_address", tokenAddress)
      .neq("status", "claimed")
      .select("token_address, status, claimed_wallet")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) return { ok: false, message: "This designation was already claimed." };

    return {
      ok: true,
      message:
        "Claimed. Creator fees for this token pay to your wallet on chain — OURBLAST never holds them.",
    };
  });
