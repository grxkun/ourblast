import { Transaction } from "@mysten/sui/transactions";
import { ZkSendLinkBuilder } from "@mysten/zksend";

import {
  deployerAddress,
  gasCoins,
  loadDeployer,
  referenceGasPrice,
  signAndExecute,
  withGas,
} from "./suipump-launch.server";

/**
 * Slush claim links (the zkBag mechanism Slush uses for "send by link").
 * The SUI is locked into the link's own throwaway key, and the recipient opens
 * the link in Slush — or any wallet — and sweeps it into the wallet they
 * already have. Nobody has to create a new wallet, and OURBLAST never holds
 * the funds after the link exists.
 */
export const SLUSH_CLAIM_HOST = "https://my.slush.app";
export const SLUSH_CLAIM_PATH = "/claim";

const MIST_PER_SUI = 1_000_000_000n;
/** Gas kept in the bot wallet so launches keep working after a payout link. */
const GAS_FLOOR_MIST = 2_000_000_000n;
const GAS_BUDGET = 60_000_000;

export interface SlushLinkResult {
  ok: boolean;
  url: string | null;
  digest: string | null;
  amountSui: number;
  error: string | null;
}

export function suiToMist(amountSui: number): bigint {
  return BigInt(Math.round(amountSui * 1_000_000_000));
}

/**
 * Locks `amountSui` from the OurBlastBot wallet into a fresh Slush claim link.
 * Returns the link only when the funding transaction is confirmed on chain —
 * an unfunded link would be a broken promise.
 */
export async function createSlushClaimLink(amountSui: number): Promise<SlushLinkResult> {
  const amountMist = suiToMist(amountSui);
  const base: SlushLinkResult = { ok: false, url: null, digest: null, amountSui, error: null };
  if (amountMist <= 0n) return { ...base, error: "There is nothing to send yet." };

  const keypair = await loadDeployer();
  const sender = await deployerAddress();
  if (!keypair || !sender) return { ...base, error: "The payout wallet is not configured." };

  const coins = await gasCoins(sender);
  if (coins.length === 0) {
    return { ...base, error: "The payout wallet holds no spendable SUI coins right now." };
  }

  const tx = new Transaction();
  const [claimable] = tx.splitCoins(tx.gas, [amountMist]);
  if (!claimable) return { ...base, error: "The payout could not be prepared." };

  const builder = new ZkSendLinkBuilder({
    // Only object refs are claimable here, so the builder never calls the client.
    client: { network: "mainnet" } as never,
    sender,
    host: SLUSH_CLAIM_HOST,
    path: SLUSH_CLAIM_PATH,
    network: "mainnet",
  });
  builder.addClaimableObjectRef(claimable, "0x2::coin::Coin<0x2::sui::SUI>");

  let sendTx: Transaction;
  try {
    sendTx = await builder.createSendTransaction({ transaction: tx });
  } catch (error) {
    return { ...base, error: `The payout link could not be prepared: ${(error as Error).message}` };
  }

  const gasPrice = await referenceGasPrice();
  withGas(sendTx, sender, coins, gasPrice, GAS_BUDGET);

  const executed = await signAndExecute(sendTx, keypair);
  if (!executed.ok) {
    return { ...base, digest: executed.digest, error: executed.error ?? "The payout did not confirm on chain." };
  }

  return { ok: true, url: builder.getLink(), digest: executed.digest, amountSui, error: null };
}

/** Largest amount that can be sent while leaving gas behind, in SUI. */
export async function payableBalanceSui(): Promise<number> {
  const sender = await deployerAddress();
  if (!sender) return 0;
  const total = (await gasCoins(sender)).reduce((sum, coin) => sum + BigInt(coin.version ? 0 : 0), 0n);
  // Coin balances are not part of the owned-object shape, so read them back by id.
  void total;
  const { rpc } = await import("./suipump-launch.server");
  const result = await rpc<{ totalBalance: string }>("suix_getBalance", [sender, "0x2::sui::SUI"]).catch(() => null);
  const balance = BigInt(result?.totalBalance ?? "0");
  const spendable = balance > GAS_FLOOR_MIST ? balance - GAS_FLOOR_MIST : 0n;
  return Number(spendable) / Number(MIST_PER_SUI);
}
