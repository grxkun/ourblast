import { Aftermath } from "aftermath-ts-sdk";
import { AggregatorClient, Env } from "@cetusprotocol/aggregator-sdk";
import { buildTx as buildBluefinTx, getQuote as getBluefinQuote } from "@bluefin-exchange/bluefin7k-aggregator-sdk";
import { Transaction } from "@mysten/sui/transactions";
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
const AFTERMATH_ATTEMPTS = 2;
const AFTERMATH_TIMEOUT_MS = 6_000;
// Cetus starts shortly after Aftermath. The first valid route wins, so a slow
// aggregator cannot consume the entire X poll before the fallback is tried.
const CETUS_HEAD_START_MS = 1_500;
const BUILD_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), ms)),
  ]);
}

export type SwapResult =
  | { ok: true; digest: string; received: bigint | null; quoted: bigint; coinOut: string; venue: "Bluefin" | "Aftermath" | "Cetus" }
  | { ok: false; error: string };

type BuiltSwap = { tx: Transaction; quoted: bigint; venue: "Bluefin" | "Aftermath" | "Cetus" };

function isTransientAftermathError(error: unknown): boolean {
  const message = String((error as Error)?.message ?? error);
  return /HTTP 5\d\d|timeout|timed out|fetch failed|network|ECONNRESET|temporarily unavailable/i.test(message);
}

async function waitBeforeRetry(attempt: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
}

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

  let built: BuiltSwap;
  try {
    // First check the exact pair against Bluefin's own pool source. BLAST has
    // Bluefin liquidity, so this avoids needlessly asking unrelated routers.
    built = await buildBluefinSwap(sender, inType, outType, amountIn).catch(() =>
      Promise.any([
        buildAftermathSwap(sender, inType, outType, amountIn),
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, CETUS_HEAD_START_MS));
          const result = await buildCetusSwap(sender, inType, outType, amountIn);
          if (!result.ok) throw new Error(result.error);
          return { ...result, venue: "Cetus" as const };
        })(),
      ]),
    );
  } catch (error) {
    const messages = error instanceof AggregateError
      ? error.errors.map((item) => String((item as Error)?.message ?? item)).join(" | ")
      : String((error as Error)?.message ?? error);
    console.error("swap aggregators failed", messages);
    if (/insufficient/i.test(messages)) return { ok: false, error: "Not enough balance for this trade plus fees." };
    if (/timeout|HTTP 5\d\d|fetch failed|network|temporarily unavailable/i.test(messages)) {
      return { ok: false, error: "Aftermath and Cetus are having trouble right now. Nothing was spent — try again in a minute." };
    }
    return { ok: false, error: "No swap route found for this token on Aftermath or Cetus." };
  }

  const gas = await gasCoins(sender);
  if (gas.length === 0) return { ok: false, error: "Your OurBank wallet has no SUI for network fees." };
  withGas(built.tx, sender, gas, await referenceGasPrice(), Number(SWAP_GAS_BUDGET));
  try {
    // Resolve the aggregator's object inputs once; signAndExecute then simulates and submits.
    await withTimeout(
      built.tx.build({ client: new SuiJsonRpcClient({ url: BUILD_RPC, network: "mainnet" }) }),
      BUILD_TIMEOUT_MS,
      "Swap build",
    );
  } catch (error) {
    if (/timeout/i.test((error as Error).message)) return { ok: false, error: "The network was too slow to prepare this trade. Nothing was spent — try again in a minute." };
    return { ok: false, error: `Could not prepare the swap: ${(error as Error).message.slice(0, 100)}` };
  }

  const executed = await signAndExecute(built.tx, keypair);
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
  return { ok: true, digest: executed.digest, received, quoted: built.quoted, coinOut: outType, venue: built.venue };
}

async function buildBluefinSwap(sender: string, inType: string, outType: string, amountIn: bigint): Promise<BuiltSwap> {
  const quote = await withTimeout(
    getBluefinQuote(
      { tokenIn: inType, tokenOut: outType, amountIn: amountIn.toString(), sources: ["bluefin"] },
      { signal: AbortSignal.timeout(AFTERMATH_TIMEOUT_MS) },
    ),
    AFTERMATH_TIMEOUT_MS,
    "Bluefin pool check",
  );
  if (normalizeStructTag(quote.tokenIn) !== inType || normalizeStructTag(quote.tokenOut) !== outType) {
    throw new Error("Bluefin returned different coins.");
  }
  if (!quote.swaps.length || !quote.routes?.length) throw new Error("No Bluefin pool route.");
  const routedAmount = quote.swaps.reduce((total, swap) => total + BigInt(swap.amount), 0n);
  if (routedAmount !== amountIn) throw new Error("Bluefin changed the trade size.");
  if (!quote.routes.every((route) => route.hops.every((hop) => hop.pool.type === "bluefin"))) {
    throw new Error("Bluefin returned a route outside its own pool.");
  }
  const quoted = quote.swaps.reduce((total, swap) => total + BigInt(swap.returnAmount), 0n);
  if (quoted <= 0n) throw new Error("No Bluefin liquidity.");
  const built = await withTimeout(
    buildBluefinTx({
      quoteResponse: quote,
      accountAddress: sender,
      slippage: SLIPPAGE,
      commission: { partner: sender, commissionBps: 0 },
    }),
    AFTERMATH_TIMEOUT_MS,
    "Bluefin transaction",
  );
  if (!(built.tx instanceof Transaction)) throw new Error("Bluefin returned an unsupported sponsored transaction.");
  return { tx: built.tx, quoted, venue: "Bluefin" };
}

async function buildAftermathSwap(sender: string, inType: string, outType: string, amountIn: bigint): Promise<BuiltSwap> {
  const sdk = await Aftermath.create({ network: "MAINNET" });
  const router = sdk.Router();
  let lastError: unknown = new Error("No Aftermath route.");
  for (let attempt = 1; attempt <= AFTERMATH_ATTEMPTS; attempt += 1) {
    try {
      const route = await withTimeout(
        router.getCompleteTradeRouteGivenAmountIn(
          { coinInType: inType, coinOutType: outType, coinInAmount: amountIn },
          AbortSignal.timeout(AFTERMATH_TIMEOUT_MS),
        ),
        AFTERMATH_TIMEOUT_MS,
        "Aftermath route",
      );
      if (normalizeStructTag(route.coinIn.type) !== inType || normalizeStructTag(route.coinOut.type) !== outType) {
        throw new Error("Aftermath returned different coins.");
      }
      if (BigInt(route.coinIn.amount) !== amountIn) throw new Error("Aftermath changed the trade size.");
      const quoted = BigInt(route.coinOut.amount);
      if (quoted <= 0n) throw new Error("No Aftermath liquidity.");
      const tx = await withTimeout(
        router.getTransactionForCompleteTradeRoute({ walletAddress: sender, completeRoute: route, slippage: SLIPPAGE }),
        AFTERMATH_TIMEOUT_MS,
        "Aftermath transaction",
      );
      return { tx, quoted, venue: "Aftermath" };
    } catch (error) {
      lastError = error;
      if (attempt >= AFTERMATH_ATTEMPTS || !isTransientAftermathError(error)) break;
      await waitBeforeRetry(attempt);
    }
  }
  throw lastError;
}

/**
 * Fallback: Cetus aggregator (Cetus CLMM + other Sui pools). Same guard rails:
 * exact coins, exact size, 1% slippage; the tx is simulated before signing.
 */
async function buildCetusSwap(
  sender: string,
  inType: string,
  outType: string,
  amountIn: bigint,
): Promise<{ ok: true; tx: Transaction; quoted: bigint } | { ok: false; error: string }> {
  try {
    const client = new AggregatorClient({ signer: sender, env: Env.Mainnet });
    const router = await withTimeout(
      client.findRouters({ from: inType, target: outType, amount: amountIn.toString(), byAmountIn: true }),
      AFTERMATH_TIMEOUT_MS,
      "Cetus route",
    );
    if (!router || router.error || router.insufficientLiquidity || router.paths.length === 0) {
      return { ok: false, error: router?.error?.msg ?? "No Cetus route." };
    }
    if (BigInt(router.amountIn.toString()) !== amountIn) return { ok: false, error: "Cetus changed the trade size." };
    const quoted = BigInt(router.amountOut.toString());
    if (quoted <= 0n) return { ok: false, error: "No liquidity on Cetus." };
    const tx = new Transaction();
    tx.setSender(sender);
    await withTimeout(client.fastRouterSwap({ router, slippage: SLIPPAGE, txb: tx }), AFTERMATH_TIMEOUT_MS, "Cetus transaction");
    return { ok: true, tx, quoted };
  } catch (error) {
    console.error("cetus route failed", error);
    return { ok: false, error: String((error as Error)?.message ?? error) };
  }
}

export { SUI as SWAP_SUI, SWAP_GAS_BUDGET };
