// SPDX-License-Identifier: BUSL-1.1
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** What happens to EVM/Solana deposits once they reach Sui. */
export const getDepositAction = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("bank_preferences").select("deposit_action").eq("user_id", context.userId).maybeSingle();
    return { depositAction: (data?.deposit_action === "keep_sui" ? "keep_sui" : "buy_blast") as "buy_blast" | "keep_sui" };
  });

export const setDepositAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ depositAction: z.enum(["buy_blast", "keep_sui"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("bank_preferences")
      .upsert({ user_id: context.userId, deposit_action: data.depositAction, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    if (data.depositAction === "keep_sui") {
      // Cancel any armed auto-buy so arriving SUI stays as SUI.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("cross_chain_orders").update({ status: "expired" }).eq("user_id", context.userId).eq("status", "pending");
    }
    return { depositAction: data.depositAction };
  });

async function myRow(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("bank_wallets")
    .select("evm_address, evm_secret_ciphertext, evm_signing_backend, sol_address, sol_secret_ciphertext, sol_signing_backend")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

/** Live balances on the caller's own OurBank EVM and Solana deposit addresses. */
export const getChainBalances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const row = await myRow(context.userId);
    const { evmBalances, solBalances } = await import("./chain-balances.server");
    const [evm, sol] = await Promise.all([
      row?.evm_address ? evmBalances(row.evm_address).catch(() => []) : [],
      row?.sol_address ? solBalances(row.sol_address).catch(() => null) : null,
    ]);
    return {
      evm,
      sol,
      evmExportable: !!row?.evm_secret_ciphertext && row.evm_signing_backend !== "turnkey",
      solExportable: !!row?.sol_secret_ciphertext && row.sol_signing_backend !== "turnkey",
    };
  });

/** Reveals the caller's own EVM (0x hex) or Solana (base58, Phantom format) private key. */
export const exportChainKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ chain: z.enum(["evm", "sol"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const row = await myRow(context.userId);
    const { decryptConnectionKey } = await import("@/lib/connection-key.server");
    if (data.chain === "evm") {
      if (!row?.evm_address) throw new Error("No EVM address yet.");
      if (row.evm_signing_backend === "turnkey" || !row.evm_secret_ciphertext) throw new Error("This address is protected by a secure enclave — its key can't be exported.");
      return { address: row.evm_address, secretKey: `0x${decryptConnectionKey(row.evm_secret_ciphertext)}` };
    }
    if (!row?.sol_address) throw new Error("No Solana address yet.");
    if (row.sol_signing_backend === "turnkey" || !row.sol_secret_ciphertext) throw new Error("This address is protected by a secure enclave — its key can't be exported.");
    const { solExportKey } = await import("./chain-balances.server");
    return { address: row.sol_address, secretKey: solExportKey(decryptConnectionKey(row.sol_secret_ciphertext)) };
  });
