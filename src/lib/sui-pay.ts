import {
  DEFAULT_SUI_CHAIN,
  ECONOMY,
  FEES,
  FOUNDER_ADDRESS,
  MIST_PER_SUI,
  PRIZE_POOL_ADDRESS,
  SUI_FULLNODES,
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
    // Split the play fee on-chain into three destinations: founder share,
    // prize pool, and the community treasury (ops). All three are sent in the
    // same transaction the moment the player approves it.
    const founderCut = BigInt(Math.round(Number(amount) * ECONOMY.founderShare));
    const prizeCut = BigInt(Math.round(Number(amount) * ECONOMY.prizePoolShare));
    const opsCut = amount - founderCut - prizeCut;
    const [opsCoin, prizeCoin, founderCoin] = tx.splitCoins(tx.gas, [
      tx.pure.u64(opsCut),
      tx.pure.u64(prizeCut),
      tx.pure.u64(founderCut),
    ]);
    tx.transferObjects([opsCoin], tx.pure.address(treasuryAddress()));
    tx.transferObjects([prizeCoin], tx.pure.address(PRIZE_POOL_ADDRESS));
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

  let digest: string | undefined;
  if (feature.signAndExecuteTransaction) {
    const result = await feature.signAndExecuteTransaction({ transaction: tx, account, chain });
    digest = result?.digest;
  } else {
    const result = await feature.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      account,
      chain,
      options: { showEffects: true },
    });
    digest = result?.digest;
  }
  if (!digest) throw new Error("Wallet did not return a transaction.");

  // Wait until the transaction is actually readable on a fullnode, otherwise
  // the server-side check can run before the network has indexed it.
  await waitForDigest(digest, chain);
  return digest;
}

async function waitForDigest(digest: string, chain: string): Promise<void> {
  const url = SUI_FULLNODES[chain] ?? SUI_FULLNODES[DEFAULT_SUI_CHAIN]!;
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "sui_getTransactionBlock",
          params: [digest, { showEffects: true }],
        }),
      });
      const json = (await res.json()) as { result?: unknown };
      if (json.result) return;
    } catch {
      /* transient network issue in a wallet browser — keep polling */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}
