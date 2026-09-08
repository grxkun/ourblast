import {
  DEFAULT_SUI_CHAIN,
  ECONOMY,
  FEES,
  FOUNDER_ADDRESS,
  MIST_PER_SUI,
  type PaymentPurpose,
  treasuryAddress,
} from "./ourblast.config";

/**
 * Builds and submits a plain SUI transfer from the connected wallet to the
 * OURBLAST treasury. The app never holds keys or funds — the wallet signs and
 * the user approves. The returned digest is later verified server-side before
 * anything is unlocked or awarded.
 */
export async function payFeeToTreasury(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wallet: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  account: any,
  purpose: PaymentPurpose,
): Promise<string> {
  const { Transaction } = await import("@mysten/sui/transactions");

  const amount = BigInt(Math.round(FEES[purpose] * MIST_PER_SUI));
  const tx = new Transaction();
  tx.setSender(account.address);

  if (purpose === "game") {
    // Split the play fee on-chain: founder share goes to the founder wallet,
    // the rest (prize pool + treasury) lands in the community treasury.
    const founderCut = BigInt(Math.round(Number(amount) * ECONOMY.founderShare));
    const [treasuryCoin, founderCoin] = tx.splitCoins(tx.gas, [
      tx.pure.u64(amount - founderCut),
      tx.pure.u64(founderCut),
    ]);
    tx.transferObjects([treasuryCoin], tx.pure.address(treasuryAddress()));
    tx.transferObjects([founderCoin], tx.pure.address(FOUNDER_ADDRESS));
  } else {
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);
    tx.transferObjects([coin], tx.pure.address(treasuryAddress()));
  }

  const chain: string =
    (account.chains as string[] | undefined)?.find((c) => c.startsWith("sui:")) ??
    DEFAULT_SUI_CHAIN;

  const feature =
    wallet.features["sui:signAndExecuteTransaction"] ??
    wallet.features["sui:signAndExecuteTransactionBlock"];
  if (!feature) throw new Error("This wallet cannot send transactions.");

  if (feature.signAndExecuteTransaction) {
    const result = await feature.signAndExecuteTransaction({ transaction: tx, account, chain });
    if (!result?.digest) throw new Error("Wallet did not return a transaction.");
    return result.digest as string;
  }

  const result = await feature.signAndExecuteTransactionBlock({
    transactionBlock: tx,
    account,
    chain,
  });
  if (!result?.digest) throw new Error("Wallet did not return a transaction.");
  return result.digest as string;
}
