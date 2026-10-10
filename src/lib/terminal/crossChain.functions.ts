// SPDX-License-Identifier: BUSL-1.1
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BLAST = "0x577a8addf60a34d4c705914ad066a3b28c3fc40d365ed0d9dfc408f29b4725d3::blast::BLAST";

/** Opens an auto-swap order: returns the OurBank address to use as the bridge destination. */
export const startCrossChainOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ targetCoin: z.string().min(3).max(300).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: account } = await db.from("x_accounts").select("username").eq("user_id", context.userId).maybeSingle();
    if (!account) return { ok: false as const, error: "Sign in with X first to get your OurBank wallet." };
    const { ensureBankWallet } = await import("./bank-wallet.server");
    const wallet = await ensureBankWallet(account.username, context.userId);
    const { suiBalance } = await import("./crossChain.server");
    const baseline = await suiBalance(wallet.address);
    await db.from("cross_chain_orders").update({ status: "cancelled" }).eq("user_id", context.userId).eq("status", "pending");
    const { data: row, error } = await db
      .from("cross_chain_orders")
      .insert({ user_id: context.userId, x_username: account.username.toLowerCase(), wallet: wallet.address, target_coin: data.targetCoin ?? BLAST, baseline_sui: baseline.toString() as unknown as number })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true as const, id: row.id, address: wallet.address };
  });

export const getCrossChainOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("cross_chain_orders")
      .select("id, status, tx_digest, error, received_sui, swapped_sui, received_out, expires_at")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return null;
    return { ...row, received_sui: row.received_sui?.toString() ?? null, swapped_sui: row.swapped_sui?.toString() ?? null, received_out: row.received_out?.toString() ?? null };
  });
