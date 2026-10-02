// SPDX-License-Identifier: BUSL-1.1
import { BOT_WALLET_ADDRESS } from "@/lib/ourblast.config";

import { launchFeeMist, lowBalanceNotice, noWalletNotice, requiredBalanceMist } from "./launchFee";

/**
 * Collects the X launch fee from the caller's own OurBank wallet before any
 * launchpad call happens. No wallet, or not enough SUI, means the launch never
 * starts — nothing is minted and no chain call is made.
 */
export type LaunchFeeResult =
  | { ok: true; digest: string; amountMist: bigint; payerAddress: string }
  | { ok: false; notice: string };

export async function collectLaunchFee(
  caller: string | { handle?: string | null; userId?: string | null },
  padId: string,
): Promise<LaunchFeeResult> {
  const { findBankWallet, findBankWalletByUserId, sendFromBankWallet, SUI_TYPE } = await import("./bank-wallet.server");
  const { rpc } = await import("./suipump-launch.server");

  const handle = typeof caller === "string" ? caller : caller.handle ?? null;
  const userId = typeof caller === "string" ? null : caller.userId ?? null;

  // A terminal launch may have no linked X handle, so the signed-in account is
  // the fallback way to find the caller's own OurBank wallet.
  let wallet = handle && handle !== "terminal" ? await findBankWallet(handle) : null;
  if (!wallet && userId) wallet = await findBankWalletByUserId(userId);
  if (!wallet) return { ok: false, notice: noWalletNotice(Boolean(userId)) };

  const balance = await rpc<{ totalBalance: string }>("suix_getBalance", [wallet.address, SUI_TYPE]);
  const have = BigInt(balance?.totalBalance ?? "0");
  if (have < requiredBalanceMist(padId)) return { ok: false, notice: lowBalanceNotice(padId, have) };

  const amountMist = launchFeeMist(padId);
  const sent = await sendFromBankWallet(wallet, SUI_TYPE, amountMist, BOT_WALLET_ADDRESS);
  if (!sent.ok) {
    return { ok: false, notice: `The launch fee could not be taken from your OurBank wallet: ${sent.error}` };
  }
  return { ok: true, digest: sent.digest, amountMist, payerAddress: wallet.address };
}

/**
 * Returns a collected launch fee from the bot wallet to the payer when the
 * launch did not reach the chain. Never throws; reports success or the reason.
 */
export async function refundLaunchFee(payerAddress: string, amountMist: bigint): Promise<{ ok: true; digest: string } | { ok: false; error: string }> {
  try {
    const { Transaction } = await import("@mysten/sui/transactions");
    const { loadDeployer, gasCoins, withGas, signAndExecute, rpc } = await import("./suipump-launch.server");
    const bot = await loadDeployer();
    if (!bot) return { ok: false, error: "bot wallet unavailable" };
    const sender = bot.getPublicKey().toSuiAddress();
    const gas = await gasCoins(sender);
    if (gas.length === 0) return { ok: false, error: "bot wallet has no SUI" };
    const price = await rpc<string>("suix_getReferenceGasPrice", []);
    const tx = new Transaction();
    withGas(tx, sender, gas, Number(price ?? 1000), 10_000_000);
    const [coin] = tx.splitCoins(tx.gas, [amountMist]);
    tx.transferObjects([coin], payerAddress);
    const res = await signAndExecute(tx, bot);
    if (!res.ok || !res.digest) return { ok: false, error: res.error ?? "refund rejected" };
    return { ok: true, digest: res.digest };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
