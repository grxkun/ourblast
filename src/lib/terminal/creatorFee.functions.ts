import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  canChangeRecipientAfterDeploy,
  canRecallDesignation,
  normalizeDesignation,
  recipientLockedNote,
} from "./creatorFee";

/** Unguessable token for a one-time claim link. */
function claimToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

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
      .select("id, recipient_wallet, launchpad, deployer_user_id, status")
      .eq("token_address", clean.tokenAddress)
      .maybeSingle();

    if (existing) {
      if (existing.deployer_user_id !== context.userId) {
        throw new Error("Only the deployer who created this designation can change it.");
      }
      // A recalled endorsement is free to re-designate — the deployer already
      // took it back, so nothing is being changed behind a recipient's back.
      if (existing.status !== "recalled" && !canChangeRecipientAfterDeploy(existing.launchpad)) {
        throw new Error(recipientLockedNote(existing.launchpad));
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
    if (row.status === "recalled") {
      return { ok: false, message: "The deployer recalled this endorsement, so it can no longer be claimed." };
    }
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

/**
 * The deployer takes an unclaimed endorsement back. The designated wallet can no
 * longer claim, any claim link created for it is revoked, and a fresh claim link
 * is issued to the deployer's own X handle so they can claim the parked fees
 * themselves.
 */
export const recallCreatorFeeDesignation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ tokenAddress: z.string().min(4).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const tokenAddress = data.tokenAddress.trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await supabaseAdmin
      .from("creator_fee_designations")
      .select("token_symbol, status, deployer_user_id, recipient_x_handle, unclaimed_amount")
      .eq("token_address", tokenAddress)
      .maybeSingle();
    if (!row) return { ok: false, claimPath: null, message: "No designation exists for that token." };
    if (row.deployer_user_id !== context.userId) {
      return { ok: false, claimPath: null, message: "Only the deployer of this token can recall its endorsement." };
    }
    if (!canRecallDesignation({ status: row.status as "designated" })) {
      return {
        ok: false,
        claimPath: null,
        message:
          row.status === "claimed"
            ? "The recipient already claimed this one, so it cannot be recalled."
            : "This endorsement was already recalled.",
      };
    }

    const { data: recalled, error } = await supabaseAdmin
      .from("creator_fee_designations")
      .update({ status: "recalled", recalled_at: new Date().toISOString() })
      .eq("token_address", tokenAddress)
      .in("status", ["designated", "claimable"])
      .select("token_address")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!recalled) return { ok: false, claimPath: null, message: "This endorsement was already recalled." };

    const symbol = String(row.token_symbol).toUpperCase();

    // The recipient's claim link stops working the moment the endorsement ends.
    if (row.recipient_x_handle) {
      await supabaseAdmin
        .from("fee_claim_links")
        .update({ status: "revoked" })
        .eq("launch_symbol", symbol)
        .ilike("x_username", row.recipient_x_handle)
        .eq("status", "pending")
        .is("slush_url", null);
    }

    // Fresh link for the deployer themselves.
    const { data: account } = await context.supabase
      .from("x_accounts")
      .select("username")
      .eq("user_id", context.userId)
      .maybeSingle();
    const handle = account?.username ?? null;
    if (!handle) {
      return {
        ok: true,
        claimPath: null,
        message:
          "Endorsement recalled. Link your X account in the terminal and recall again to get your own claim link.",
      };
    }

    const token = claimToken();
    const { error: linkError } = await supabaseAdmin.from("fee_claim_links").insert({
      token,
      launch_symbol: symbol,
      x_username: handle,
      amount_sui: Number(row.unclaimed_amount ?? 0),
      created_by: context.userId,
    });
    if (linkError) throw new Error(linkError.message);

    return {
      ok: true,
      claimPath: `/claim/${token}`,
      message: "Endorsement recalled. A new claim link was issued to you.",
    };
  });
