import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_SUI_CHAIN,
  DEFAULT_TREASURY_ADDRESS,
  SUI_FULLNODES,
  feeInMist,
} from "./ourblast.config";

const input = z.object({
  digest: z.string().min(20).max(120),
  purpose: z.enum(["game", "chat"]),
});

function serverTreasury(): string {
  const configured = process.env['OURBLAST_TREASURY_ADDRESS'];
  return (configured && configured.startsWith("0x") ? configured : DEFAULT_TREASURY_ADDRESS).toLowerCase();
}

function fullnode(): string {
  const chain = process.env['SUI_CHAIN'] ?? DEFAULT_SUI_CHAIN;
  return SUI_FULLNODES[chain] ?? SUI_FULLNODES[DEFAULT_SUI_CHAIN]!;
}

type BalanceChange = {
  owner: { AddressOwner?: string } | string;
  coinType: string;
  amount: string;
};

/**
 * Verifies a SUI payment on chain before anything is unlocked.
 *
 * Checks: the transaction exists, it succeeded, the sender is this player's
 * own wallet, the exact fee (or more) landed on the configured treasury
 * address, and the digest has never been recorded before. The unique digest
 * column makes replay/double-credit impossible even under a race.
 */
export const verifyPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("sui_payments")
      .select("id, user_id, purpose, consumed_at")
      .eq("digest", data.digest)
      .maybeSingle();
    if (existing) {
      if (existing.user_id !== userId || existing.purpose !== data.purpose || existing.consumed_at) {
        throw new Error("That payment has already been used.");
      }
      return { paymentId: existing.id as string };
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("wallet_address, is_banned")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) throw new Error("Profile not found.");
    if (profile.is_banned) throw new Error("This wallet is banned from OURBLAST.");

    // Poll briefly: a freshly executed transaction may not be readable yet.
    let tx: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 6 && !tx; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1200));
      const res = await fetch(fullnode(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "sui_getTransactionBlock",
          params: [
            data.digest,
            { showEffects: true, showBalanceChanges: true, showInput: true },
          ],
        }),
      });
      const json = (await res.json()) as { result?: Record<string, unknown> };
      if (json.result) tx = json.result;
    }
    if (!tx) throw new Error("Payment not found on the Sui network yet. Try again in a moment.");

    const effects = tx['effects'] as { status?: { status?: string } } | undefined;
    if (effects?.status?.status !== "success") throw new Error("That payment did not succeed.");

    const sender = (
      (tx['transaction'] as { data?: { sender?: string } } | undefined)?.data?.sender ?? ""
    ).toLowerCase();
    if (!sender || sender !== profile.wallet_address.toLowerCase()) {
      throw new Error("That payment came from a different wallet.");
    }

    const treasury = serverTreasury();
    const required = feeInMist(data.purpose);
    const changes = (tx['balanceChanges'] ?? []) as BalanceChange[];
    const received = changes
      .filter((c) => {
        const owner = typeof c.owner === "string" ? c.owner : c.owner?.AddressOwner;
        return (
          owner?.toLowerCase() === treasury &&
          (c.coinType === "0x2::sui::SUI" || c.coinType.endsWith("::sui::SUI"))
        );
      })
      .reduce((sum, c) => sum + Number(c.amount), 0);

    if (received < required) {
      throw new Error("That payment did not reach the OURBLAST treasury.");
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("sui_payments")
      .insert({
        user_id: userId,
        purpose: data.purpose,
        digest: data.digest,
        sender,
        recipient: treasury,
        amount_mist: received,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error("Payment already used.");

    return { paymentId: inserted.id as string };
  });
