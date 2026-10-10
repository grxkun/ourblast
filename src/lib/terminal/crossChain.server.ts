// SPDX-License-Identifier: BUSL-1.1
import { normalizeStructTag } from "@mysten/sui/utils";
import { crossChainSwapAmount } from "./crossChain";

const SUI = normalizeStructTag("0x2::sui::SUI");

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export async function suiBalance(address: string): Promise<bigint> {
  const { bankBalances } = await import("./bank-wallet.server");
  const balances = await bankBalances(address);
  return balances.find((b) => b.coinType === SUI)?.balance ?? 0n;
}

/**
 * Watches OurBank wallets with an open cross-chain order: once the bridged SUI
 * lands, swaps it (minus a gas reserve) into the target token. A failed swap
 * leaves the SUI in the wallet untouched.
 */
export async function maintainCrossChainOrders(): Promise<void> {
  const db = await admin();
  await db.from("cross_chain_orders").update({ status: "expired" }).eq("status", "pending").lt("expires_at", new Date().toISOString());
  const { data: orders } = await db.from("cross_chain_orders").select("*").eq("status", "pending").limit(20);
  for (const order of orders ?? []) {
    try {
      const current = await suiBalance(order.wallet);
      const amount = crossChainSwapAmount(BigInt(order.baseline_sui), current);
      if (amount <= 0n) continue;
      // Claim the order so two poll runs never swap the same deposit.
      const { data: claimed } = await db
        .from("cross_chain_orders")
        .update({ status: "swapping", received_sui: (current - BigInt(order.baseline_sui)).toString(), swapped_sui: amount.toString() })
        .eq("id", order.id)
        .eq("status", "pending")
        .select("id");
      if (!claimed?.length) continue;
      const { findBankWallet } = await import("./bank-wallet.server");
      const wallet = await findBankWallet(order.x_username);
      if (!wallet || wallet.address !== order.wallet) throw new Error("OurBank wallet not found.");
      const { executeBankSwap } = await import("./bank-swap.server");
      const result = await executeBankSwap(wallet, SUI, order.target_coin, amount);
      if (result.ok) {
        await db.from("cross_chain_orders").update({ status: "completed", tx_digest: result.digest, received_out: (result.received ?? result.quoted).toString() }).eq("id", order.id);
      } else {
        await db.from("cross_chain_orders").update({ status: "failed", error: result.error.slice(0, 300) }).eq("id", order.id);
      }
    } catch (error) {
      await db.from("cross_chain_orders").update({ status: "failed", error: (error as Error).message.slice(0, 300) }).eq("id", order.id).eq("status", "swapping");
      console.error(`cross-chain order ${order.id} failed`, error);
    }
  }
}
