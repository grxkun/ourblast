import { Aftermath } from "aftermath-ts-sdk";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { normalizeStructTag, normalizeSuiAddress } from "@mysten/sui/utils";

import { decryptConnectionKey } from "@/lib/connection-key.server";
import { toAtomic, type SwapCommand } from "./bank";

/**
 * OurBank swaps: "buy 5 SUI of 0x…" / "sell 50% $MOO" from X, routed through
 * the Aftermath aggregator and signed with the sender's OurBank wallet.
 * Guard rails: 1% max slippage, route must match the requested coins exactly,
 * the whole transaction is simulated before signing, and success is only
 * reported once the chain confirms it.
 */
const SUI = normalizeStructTag("0x2::sui::SUI");
const SLIPPAGE = 0.01;
const SWAP_GAS_BUDGET = 50_000_000n; // 0.05 SUI
// nodeinfra rejects this build ("Index store not available"); suiscan works.
const BUILD_RPC = "https://rpc-mainnet.suiscan.xyz";

export type SwapResult =
  | { ok: true; digest: string; received: bigint | null; quoted: bigint; coinOut: string }
  | { ok: false; error: string };

function formatUnits(value: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = (value % base).toString().padStart(decimals, "0").slice(0, 4).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}
export { formatUnits };

/** Amount of coin-in in smallest units for this command, given the wallet's balance. */
export function swapAmountIn(command: SwapCommand, decimals: number, balance: bigint): bigint {
  if (command.side === "buy") return toAtomic(command.amount, 9);
  if (command.amount === "all") return balance;
  if (command.amount.endsWith("%")) {
    const bps = BigInt(Math.round(Number(command.amount.slice(0, -1)) * 100));
    return (balance * bps) / 10_000n;
  }
  return toAtomic(command.amount, decimals);
}

export async function executeBankSwap(
  wallet: { address: string; secret_ciphertext: string },
  coinIn: string,
  coinOut: string,
  amountIn: bigint,
): Promise<SwapResult> {
  const { gasCoins, referenceGasPrice, withGas, signAndExecute, rpc } = await import("./suipump-launch.server");
  const keypair = Ed25519Keypair.fromSecretKey(decryptConnectionKey(wallet.secret_ciphertext));
  const sender = keypair.getPublicKey().toSuiAddress();
  if (sender !== normalizeSuiAddress(wallet.address)) return { ok: false, error: "Bank wallet key mismatch." };
  const inType = normalizeStructTag(coinIn);
  const outType = normalizeStructTag(coinOut);
  if (inType === outType) return { ok: false, error: "Nothing to swap." };
  if (amountIn <= 0n) return { ok: false, error: "Amount is too small." };

  let tx;
  let quoted: bigint;
  try {
    const sdk = await Aftermath.create({ network: "MAINNET" });
    const router = sdk.Router();
    const route = await router.getCompleteTradeRouteGivenAmountIn({ coinInType: inType, coinOutType: outType, coinInAmount: amountIn });
    if (normalizeStructTag(route.coinIn.type) !== inType || normalizeStructTag(route.coinOut.type) !== outType) {
      return { ok: false, error: "Aggregator returned a route for different coins — not trading." };
    }
    if (BigInt(route.coinIn.amount) !== amountIn) return { ok: false, error: "Aggregator changed the trade size — not trading." };
    quoted = BigInt(route.coinOut.amount);
    if (quoted <= 0n) return { ok: false, error: "No liquidity for this token right now." };
    // Aftermath's transaction endpoint sometimes returns a one-off HTTP 500
    // even though the route is valid, so give it a few attempts.
    for (let attempt = 1; ; attempt++) {
      try {
        tx = await router.getTransactionForCompleteTradeRoute({ walletAddress: sender, completeRoute: route, slippage: SLIPPAGE });
        break;
      } catch (error) {
        if (attempt >= 3 || !/HTTP 5\d\d/.test(String((error as Error)?.message))) throw error;
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
  } catch (error) {
    console.error("aftermath route failed", error);
    if (/insufficient/i.test(String((error as Error)?.message))) return { ok: false, error: "Not enough balance for this trade plus fees." };
    if (/HTTP 5\d\d/.test(String((error as Error)?.message))) return { ok: false, error: "Aftermath is having trouble right now. Nothing was spent — try again in a minute." };
    return { ok: false, error: "No swap route found for this token on Aftermath." };
  }

  const gas = await gasCoins(sender);
  if (gas.length === 0) return { ok: false, error: "Your OurBank wallet has no SUI for network fees." };
  withGas(tx, sender, gas, await referenceGasPrice(), Number(SWAP_GAS_BUDGET));
  try {
    // Resolve the aggregator's object inputs once; signAndExecute then simulates and submits.
    await tx.build({ client: new SuiJsonRpcClient({ url: BUILD_RPC, network: "mainnet" }) });
  } catch (error) {
    return { ok: false, error: `Could not prepare the swap: ${(error as Error).message.slice(0, 100)}` };
  }

  const executed = await signAndExecute(tx, keypair);
  if (!executed.ok || !executed.digest) return { ok: false, error: executed.error ?? "Swap failed." };

  let received: bigint | null = null;
  try {
    const info = await rpc<{ balanceChanges?: { owner: { AddressOwner?: string }; coinType: string; amount: string }[] }>(
      "sui_getTransactionBlock",
      [executed.digest, { showBalanceChanges: true }],
    );
    const change = info.balanceChanges?.find(
      (c) => c.owner.AddressOwner && normalizeSuiAddress(c.owner.AddressOwner) === sender && normalizeStructTag(c.coinType) === outType,
    );
    if (change) received = BigInt(change.amount);
  } catch {
    /* quote is shown instead */
  }
  return { ok: true, digest: executed.digest, received, quoted, coinOut: outType };
}

export { SUI as SWAP_SUI, SWAP_GAS_BUDGET };
