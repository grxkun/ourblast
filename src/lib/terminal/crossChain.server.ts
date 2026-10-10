// SPDX-License-Identifier: BUSL-1.1
import { normalizeStructTag } from "@mysten/sui/utils";
import { crossChainSwapAmount, crossChainUsdcSwapAmount, SUI_USDC } from "./crossChain";

const SUI = normalizeStructTag("0x2::sui::SUI");
const USDC = normalizeStructTag(SUI_USDC);

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export async function walletBalances(address: string): Promise<{ sui: bigint; usdc: bigint }> {
  const { bankBalances } = await import("./bank-wallet.server");
  const balances = await bankBalances(address);
  const of = (t: string) => balances.find((b) => normalizeStructTag(b.coinType) === t)?.balance ?? 0n;
  return { sui: of(SUI), usdc: of(USDC) };
}

export async function suiBalance(address: string): Promise<bigint> {
  return (await walletBalances(address)).sui;
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
      const bal = await walletBalances(order.wallet);
      // USDC (CCTP from Arc & co.) first, else bridged SUI.
      const usdcAmount = crossChainUsdcSwapAmount(BigInt(order.baseline_usdc ?? 0), bal.usdc);
      const coinIn = usdcAmount > 0n ? USDC : SUI;
      const current = usdcAmount > 0n ? bal.usdc : bal.sui;
      const base = usdcAmount > 0n ? BigInt(order.baseline_usdc ?? 0) : BigInt(order.baseline_sui);
      const amount = usdcAmount > 0n ? usdcAmount : crossChainSwapAmount(base, current);
      if (amount <= 0n) continue;
      // Claim the order so two poll runs never swap the same deposit.
      const { data: claimed } = await db
        .from("cross_chain_orders")
        .update({ status: "swapping", deposit_coin: coinIn === USDC ? "USDC" : "SUI", received_sui: (current - base).toString() as unknown as number, swapped_sui: amount.toString() as unknown as number })
        .eq("id", order.id)
        .eq("status", "pending")
        .select("id");
      if (!claimed?.length) continue;
      const { findBankWallet } = await import("./bank-wallet.server");
      const wallet = await findBankWallet(order.x_username);
      if (!wallet || wallet.address !== order.wallet) throw new Error("OurBank wallet not found.");
      const { executeBankSwap } = await import("./bank-swap.server");
      const result = await executeBankSwap(wallet, coinIn, order.target_coin, amount);
      if (result.ok) {
        await db.from("cross_chain_orders").update({ status: "completed", tx_digest: result.digest, received_out: (result.received ?? result.quoted).toString() as unknown as number }).eq("id", order.id);
      } else {
        await db.from("cross_chain_orders").update({ status: "failed", error: result.error.slice(0, 300) }).eq("id", order.id);
      }
    } catch (error) {
      await db.from("cross_chain_orders").update({ status: "failed", error: (error as Error).message.slice(0, 300) }).eq("id", order.id).eq("status", "swapping");
      console.error(`cross-chain order ${order.id} failed`, error);
    }
  }
}
