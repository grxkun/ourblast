/**
 * Creator-funded first ("dev") buys for the SUI-denominated launchpads
 * (POPULAR, RIPT). Mirrors the Perpsplexity USDC escrow pattern:
 *
 *   1. The creator's OurBank wallet moves exactly the buy amount in SUI to the
 *      bot wallet, in a transaction the creator signs and pays gas for.
 *   2. The bot spends that very coin inside the launch transaction, so the
 *      bot's own SUI is never used for the buy.
 *   3. On any failure after the escrow, the coin is sent back to the creator.
 *   4. After a confirmed launch, the bought Coin<T> is transferred to the
 *      creator's wallet.
 */
import { Transaction } from "@mysten/sui/transactions";

import { gasCoins, normalizeType, rpc, signAndExecute, withGas } from "./suipump-launch.server";

export interface DevBuySigner {
  address: string;
  signer: { signTransaction(bytes: Uint8Array): Promise<{ signature: string }> };
}

export interface OwnedSuiCoin {
  coinObjectId: string;
  version: string;
  digest: string;
  balance: string;
}

const ESCROW_BUDGET = 50_000_000;
const SUI = "0x2::sui::SUI";

async function suiCoins(address: string): Promise<OwnedSuiCoin[]> {
  const page = await rpc<{ data?: { coinObjectId: string; version: string; digest: string; balance: string }[] }>(
    "suix_getCoins",
    [address, SUI],
  );
  return (page.data ?? []).map((c) => ({
    coinObjectId: c.coinObjectId,
    version: String(c.version),
    digest: c.digest,
    balance: c.balance,
  }));
}

async function objectRef(objectId: string): Promise<OwnedSuiCoin | null> {
  const result = await rpc<{ data?: { objectId: string; version: string; digest: string } }>("sui_getObject", [
    objectId,
    { showContent: false },
  ]);
  if (!result.data) return null;
  return { coinObjectId: result.data.objectId, version: String(result.data.version), digest: result.data.digest, balance: "0" };
}

async function waitReceipt(digest: string): Promise<{ ok: boolean; error: string | null; createdCoinId: string | null }> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const block = await rpc<{
      effects?: { status?: { status?: string; error?: string } };
      objectChanges?: { type: string; objectId?: string; objectType?: string }[];
    }>("sui_getTransactionBlock", [digest, { showEffects: true, showObjectChanges: true }]).catch(() => null);
    const status = block?.effects?.status?.status;
    if (status) {
      return {
        ok: status === "success",
        error: status === "success" ? null : block?.effects?.status?.error ?? "Transaction failed.",
        createdCoinId:
          block?.objectChanges?.find(
            (c) => c.type === "created" && c.objectId && /::coin::Coin</.test(normalizeType(c.objectType ?? "")),
          )?.objectId ?? null,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return { ok: false, error: "Transaction not visible on chain.", createdCoinId: null };
}

/**
 * Moves exactly `amountMist` SUI from the creator wallet to the bot wallet,
 * sent and gas-paid by the creator. Returns the fresh coin (owned by the bot)
 * so the launch transaction can spend it.
 */
export async function escrowCreatorSui(args: {
  buyer: DevBuySigner;
  bot: string;
  amountMist: bigint;
  gasPrice: number;
}): Promise<{ coin: OwnedSuiCoin | null; error: string | null }> {
  try {
    const gas = await gasCoins(args.buyer.address);
    if (gas.length === 0) return { coin: null, error: "The creator wallet held no SUI for the first buy." };
    const total = (await suiCoins(args.buyer.address)).reduce((sum, c) => sum + BigInt(c.balance), 0n);
    if (total < args.amountMist + BigInt(ESCROW_BUDGET)) {
      return { coin: null, error: `The creator wallet held ${Number(total) / 1e9} SUI, not enough for the ${Number(args.amountMist) / 1e9} SUI first buy plus gas.` };
    }
    // Split straight from the gas coin so single-coin wallets work too.
    const tx = new Transaction();
    withGas(tx, args.buyer.address, gas, args.gasPrice, ESCROW_BUDGET);
    const [part] = tx.splitCoins(tx.gas, [tx.pure.u64(args.amountMist)]);
    tx.transferObjects([part!], args.bot);
    const run = await signAndExecute(tx, args.buyer.signer);
    if (!run.ok || !run.digest) return { coin: null, error: run.error ?? "Moving the first-buy SUI failed." };
    const receipt = await waitReceipt(run.digest);
    if (!receipt.ok || !receipt.createdCoinId) {
      return { coin: null, error: receipt.error ?? "The first-buy SUI transfer was not confirmed." };
    }
    const ref = await objectRef(receipt.createdCoinId);
    if (!ref) return { coin: null, error: "The first-buy SUI coin is not visible yet." };
    return { coin: { ...ref, balance: args.amountMist.toString() }, error: null };
  } catch (error) {
    return { coin: null, error: (error as Error).message };
  }
}

/**
 * Sends an escrowed first-buy coin back to the creator. Returns null on
 * success, or an error message the caller must surface — the SUI is never
 * left silently in the bot wallet.
 */
export async function refundCreatorSui(args: {
  keypair: Parameters<typeof signAndExecute>[1];
  bot: string;
  coin: OwnedSuiCoin;
  to: string;
  gasPrice: number;
}): Promise<string | null> {
  const gas = await gasCoins(args.bot).catch(() => []);
  if (gas.length === 0) return "The bot wallet has no SUI coin left to return the first-buy SUI.";
  const tx = new Transaction();
  withGas(tx, args.bot, gas, args.gasPrice, ESCROW_BUDGET);
  tx.transferObjects(
    [tx.objectRef({ objectId: args.coin.coinObjectId, version: args.coin.version, digest: args.coin.digest })],
    args.to,
  );
  const run = await signAndExecute(tx, args.keypair);
  if (!run.ok || !run.digest) return `The first-buy SUI could not be returned to the creator: ${run.error ?? "transfer failed"}.`;
  await waitReceipt(run.digest);
  return null;
}

/**
 * Hands the freshly bought Coin<T> from the launch to the creator wallet.
 * Returns null on success, or an error message to surface in the notice.
 */
export async function deliverBoughtCoin(args: {
  keypair: Parameters<typeof signAndExecute>[1];
  bot: string;
  coinType: string;
  to: string;
  gasPrice: number;
}): Promise<string | null> {
  try {
    const coins = await rpc<{ data?: { coinObjectId: string; version: string; digest: string }[] }>("suix_getCoins", [
      args.bot,
      args.coinType,
    ]);
    const coin = coins.data?.[0];
    if (!coin) return "The bought tokens were not found in the bot wallet.";
    const gas = await gasCoins(args.bot).catch(() => []);
    if (gas.length === 0) return "The bot wallet has no SUI coin left to send the bought tokens.";
    const tx = new Transaction();
    withGas(tx, args.bot, gas, args.gasPrice, ESCROW_BUDGET);
    tx.transferObjects([tx.objectRef({ objectId: coin.coinObjectId, version: String(coin.version), digest: coin.digest })], args.to);
    const run = await signAndExecute(tx, args.keypair);
    if (!run.ok || !run.digest) return `The bought tokens could not be sent to the creator: ${run.error ?? "transfer failed"}.`;
    await waitReceipt(run.digest);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}
