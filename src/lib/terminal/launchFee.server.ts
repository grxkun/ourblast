import { BOT_WALLET_ADDRESS } from "@/lib/ourblast.config";

import { launchFeeMist, lowBalanceNotice, noWalletNotice, requiredBalanceMist } from "./launchFee";

/**
 * Collects the X launch fee from the caller's own OurBank wallet before any
 * launchpad call happens. No wallet, or not enough SUI, means the launch never
 * starts — nothing is minted and no chain call is made.
 */
export type LaunchFeeResult =
  | { ok: true; digest: string; amountMist: bigint }
  | { ok: false; notice: string };

export async function collectLaunchFee(handle: string, padId: string): Promise<LaunchFeeResult> {
  const { findBankWallet, sendFromBankWallet, SUI_TYPE } = await import("./bank-wallet.server");
  const { rpc } = await import("./suipump-launch.server");

  const wallet = await findBankWallet(handle);
  if (!wallet) return { ok: false, notice: noWalletNotice() };

  const balance = await rpc<{ totalBalance: string }>("suix_getBalance", [wallet.address, SUI_TYPE]);
  const have = BigInt(balance?.totalBalance ?? "0");
  if (have < requiredBalanceMist(padId)) return { ok: false, notice: lowBalanceNotice(padId, have) };

  const amountMist = launchFeeMist(padId);
  const sent = await sendFromBankWallet(wallet, SUI_TYPE, amountMist, BOT_WALLET_ADDRESS);
  if (!sent.ok) {
    return { ok: false, notice: `The launch fee could not be taken from your OurBank wallet: ${sent.error}` };
  }
  return { ok: true, digest: sent.digest, amountMist };
}
