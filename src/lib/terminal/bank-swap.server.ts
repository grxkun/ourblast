// SPDX-License-Identifier: BUSL-1.1
import { Aftermath } from "aftermath-ts-sdk";
import { AggregatorClient, Env } from "@cetusprotocol/aggregator-sdk";
import { buildTx as buildBluefinTx, getQuote as getBluefinQuote } from "@bluefin-exchange/bluefin7k-aggregator-sdk";
import { Transaction } from "@mysten/sui/transactions";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { normalizeStructTag, normalizeSuiAddress } from "@mysten/sui/utils";

import { bankSigner } from "./bank-wallet.server";
import { toAtomic, type SwapCommand } from "./bank";
import { resolveLaunchpadBuy, buildLaunchpadBuySwap } from "./launchpad-buy.server";

/**
 * OurBank swaps: "buy 5 SUI of 0x…" / "sell 50% $MOO" from X, routed through
 * the Aftermath aggregator and signed with the sender's OurBank wallet.
 * Guard rails: 5% max slippage, route must match the requested coins exactly,
 * the whole transaction is simulated before signing, and success is only
 * reported once the chain confirms it.
 */
const SUI = normalizeStructTag("0x2::sui::SUI");
// 5%: memecoin pools on Sui move faster than 1% between quote and fill, and
// Bluefin's quote API runs 2-3% ahead of what its pool can actually pay.
const SLIPPAGE = 0.05;
const SWAP_GAS_BUDGET = 50_000_000n; // 0.05 SUI
// nodeinfra rejects this build ("Index store not available"); suiscan works.
const BUILD_RPC = "https://rpc-mainnet.suiscan.xyz";
const AFTERMATH_ATTEMPTS = 2;
const AFTERMATH_TIMEOUT_MS = 6_000;
// Cetus starts shortly after Aftermath. The first valid route wins, so a slow
// aggregator cannot consume the entire X poll before the fallback is tried.
const CETUS_HEAD_START_MS = 1_500;
const BUILD_TIMEOUT_MS = 8_000;
// A unbonded-token lookup must not block the whole bot run; if the launchpad
// feed or a shared-object read is slow, fall through to the DEX aggregators.
const LAUNCHPAD_LOOKUP_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), ms)),
  ]);
}

export type SwapResult =
  | { ok: true; digest: string; received: bigint | null; quoted: bigint; coinOut: string; venue: "Bluefin" | "Aftermath" | "Cetus" | "Suipump" | "Blast.fun" }
  | { ok: false; error: string };

type BuiltSwap = { tx: Transaction; quoted: bigint; venue: "Bluefin" | "Aftermath" | "Cetus" | "Suipump" | "Blast.fun" };

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

/**
 * A coin reference is normally a full `0x…::module::TYPE` struct tag, but launch
 * rows for Suipump store the bonding-curve object id (a bare 0x address) as the
 * token address. normalizeStructTag would mangle/throw on those, so bare ids
 * are normalized as addresses and resolved on-chain by resolveLaunchpadBuy.
 */
function normalizeCoinRef(value: string): string {
  return value.includes("::") ? normalizeStructTag(value) : normalizeSuiAddress(value);
}

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
  wallet: Parameters<typeof bankSigner>[0],
  coinIn: string,
  coinOut: string,
  amountIn: bigint,
): Promise<SwapResult> {
  const { gasCoins, referenceGasPrice, withGas, signAndExecute, rpc } = await import("./suipump-launch.server");
  const signer = await bankSigner(wallet);
  const sender = signer.address;
  if (sender !== normalizeSuiAddress(wallet.address)) return { ok: false, error: "Bank wallet key mismatch." };
  const inType = normalizeCoinRef(coinIn);
  const outType = normalizeCoinRef(coinOut);
  if (inType === outType) return { ok: false, error: "Nothing to swap." };
  if (amountIn <= 0n) return { ok: false, error: "Amount is too small." };

  const attempt = async (skipBluefin: boolean, autoGas = false) => {
    const picked = await pickSwapRoute(sender, inType, outType, amountIn, skipBluefin);
    if (!picked.ok) return { picked, executed: null };
    const built = picked.built;
    const gas = await gasCoins(sender);
    if (gas.length === 0) return { picked: { ok: false as const, error: "Your OurBank wallet has no SUI for network fees." }, executed: null };
    // Aftermath reserves the trade amount from the address balance; pinning the
    // wallet's only SUI coin as gas makes the node reject that reservation, so
    // let the SDK pick gas itself for Aftermath routes (and on reservation retries).
    if (built.venue === "Aftermath" || autoGas) {
      built.tx.setSender(sender);
      built.tx.setGasPrice(await referenceGasPrice());
      built.tx.setGasBudget(SWAP_GAS_BUDGET);
    } else {
      withGas(built.tx, sender, gas, await referenceGasPrice(), Number(SWAP_GAS_BUDGET));
    }
    try {
      // Resolve the aggregator's object inputs once; signAndExecute then simulates and submits.
      const client = new SuiJsonRpcClient({ url: BUILD_RPC, network: "mainnet" });
      const bytes = await withTimeout(built.tx.build({ client }), BUILD_TIMEOUT_MS, "Swap build");
      // Bluefin's quote can run ahead of its pool; dry-run it here so a doomed
      // trade never reaches the chain (and never burns gas).
      if (built.venue === "Bluefin") {
        const dry = await client.dryRunTransactionBlock({ transactionBlock: bytes }).catch(() => null);
        if (dry && dry.effects.status.status !== "success") {
          return { picked, built, executed: { digest: null, ok: false, error: `simulation rejected: ${dry.effects.status.error ?? "unknown"}`, created: [] } };
        }
      }
    } catch (error) {
      if (/timeout/i.test((error as Error).message)) return { picked: { ok: false as const, error: "The network was too slow to prepare this trade. Nothing was spent — try again in a minute." }, executed: null };
      return { picked: { ok: false as const, error: `Could not prepare the swap: ${(error as Error).message.slice(0, 100)}` }, executed: null };
    }
    return { picked, built, executed: await signAndExecute(built.tx, signer) };
  };

  let run = await attempt(false);
  // Bluefin's quote API can be ahead of its pool, so its trade aborts in the
  // simulation (nothing spent). Re-route through Aftermath / Cetus instead.
  if (run.executed && !run.executed.ok && run.built?.venue === "Bluefin" && /simulation rejected/i.test(run.executed.error ?? "")) {
    console.warn("bluefin simulation rejected, falling back", run.executed.error);
    run = await attempt(true);
  }
  // Nodes reject the submit (nothing spent) when the trade amount is reserved
  // from the address balance while the same SUI coin is pinned as gas.
  // Rebuild on another venue and let the SDK choose gas.
  if (run.executed && !run.executed.ok && isReservationError(run.executed.error)) {
    console.warn("withdraw reservation rejected, retrying with auto gas", run.built?.venue);
    run = await attempt(true, true);
  }
  if (!run.picked.ok) return run.picked;
  const executed = run.executed!;
  const built = run.built!;
  if (!executed.ok || !executed.digest) return { ok: false, error: friendlySwapError(executed.error ?? "Swap failed.") };

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

export function isReservationError(error: string | null | undefined): boolean {
  return /withdraw reservation|Insufficient address balance/i.test(error ?? "");
}

/** Raw Move aborts are unreadable on X; say what happened instead. */
function friendlySwapError(error: string): string {
  if (/simulation rejected/i.test(error) || /MoveAbort/i.test(error)) {
    return "the price moved past the 5% safety limit, so the trade was stopped. Nothing was spent — try again in a minute.";
  }
  return error;
}

/** Bonding-curve first (unbonded tokens), then Bluefin, then Aftermath vs Cetus. */
export async function pickSwapRoute(sender: string, inType: string, outType: string, amountIn: bigint, skipBluefin = false): Promise<{ ok: true; built: BuiltSwap } | { ok: false; error: string }> {
  // Unbonded launchpad tokens live on a bonding curve, not a DEX pool, so the
  // aggregators have no route for them. Buy them straight from the launchpad.
  if (inType === SUI) {
    try {
      const plan = await withTimeout(resolveLaunchpadBuy(outType), LAUNCHPAD_LOOKUP_MS, "Launchpad lookup");
      if (plan) {
        const built = await withTimeout(buildLaunchpadBuySwap(sender, plan, amountIn), BUILD_TIMEOUT_MS, "Launchpad build");
        if (built) return { ok: true, built: { ...built, venue: built.venue as BuiltSwap["venue"] } };
      }
    } catch {
      /* launchpad lookup/build failed — fall through to the DEX aggregators */
    }
  }

  let built: BuiltSwap;
  try {
    // First check the exact pair against Bluefin's own pool source. BLAST has
    // Bluefin liquidity, so this avoids needlessly asking unrelated routers.
    built = await (skipBluefin ? Promise.reject(new Error("skip")) : buildBluefinSwap(sender, inType, outType, amountIn)).catch(() =>
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
  return { ok: true, built };
}

/**
 * Same route checks, but for the user's own connected wallet: returns the fully
 * built, unsigned transaction bytes for their wallet to review and sign.
 * The server never signs this one.
 */
export async function prepareSwapForAddress(
  address: string,
  coinIn: string,
  coinOut: string,
  amountIn: bigint,
): Promise<{ ok: true; bytes: string; quoted: bigint; venue: BuiltSwap["venue"] } | { ok: false; error: string }> {
  const { gasCoins, referenceGasPrice, withGas } = await import("./suipump-launch.server");
  const sender = normalizeSuiAddress(address);
  const inType = normalizeCoinRef(coinIn);
  const outType = normalizeCoinRef(coinOut);
  if (inType === outType) return { ok: false, error: "Nothing to swap." };
  if (amountIn <= 0n) return { ok: false, error: "Amount is too small." };
  const picked = await pickSwapRoute(sender, inType, outType, amountIn);
  if (!picked.ok) return picked;
  const gas = await gasCoins(sender);
  if (gas.length === 0) return { ok: false, error: "Your wallet has no SUI for network fees." };
  if (picked.built.venue === "Aftermath") {
    picked.built.tx.setSender(sender);
    picked.built.tx.setGasPrice(await referenceGasPrice());
    picked.built.tx.setGasBudget(SWAP_GAS_BUDGET);
  } else {
    withGas(picked.built.tx, sender, gas, await referenceGasPrice(), Number(SWAP_GAS_BUDGET));
  }
  try {
    const bytes = await withTimeout(
      picked.built.tx.build({ client: new SuiJsonRpcClient({ url: BUILD_RPC, network: "mainnet" }) }),
      BUILD_TIMEOUT_MS,
      "Swap build",
    );
    return { ok: true, bytes: Buffer.from(bytes).toString("base64"), quoted: picked.built.quoted, venue: picked.built.venue };
  } catch (error) {
    if (/timeout/i.test((error as Error).message)) return { ok: false, error: "The network was too slow to prepare this trade. Try again in a minute." };
    return { ok: false, error: `Could not prepare the swap: ${(error as Error).message.slice(0, 100)}` };
  }
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
  // Pay with the wallet's real coin objects. Without this the SDK withdraws
  // from the newer "address balance", which OurBank wallets don't hold, and
  // the trade fails on chain.
  const tx = new Transaction();
  tx.setSender(sender);
  let coinIn;
  if (inType === SUI) {
    [coinIn] = tx.splitCoins(tx.gas, [amountIn]);
  } else {
    const { rpc } = await import("./suipump-launch.server");
    const coins = await rpc<{ data: { coinObjectId: string; balance: string }[] }>(
      "suix_getCoins",
      [sender, inType, null, 50],
    );
    const owned = coins.data ?? [];
    const total = owned.reduce((sum, c) => sum + BigInt(c.balance), 0n);
    if (!owned.length || total < amountIn) throw new Error("insufficient balance");
    const primary = tx.object(owned[0]!.coinObjectId);
    if (owned.length > 1) tx.mergeCoins(primary, owned.slice(1).map((c) => tx.object(c.coinObjectId)));
    [coinIn] = tx.splitCoins(primary, [amountIn]);
  }
  const built = await withTimeout(
    buildBluefinTx({
      quoteResponse: quote,
      accountAddress: sender,
      slippage: SLIPPAGE,
      commission: { partner: sender, commissionBps: 0 },
      extendTx: { tx, coinIn },
    }),
    AFTERMATH_TIMEOUT_MS,
    "Bluefin transaction",
  );
  if (!(built.tx instanceof Transaction)) throw new Error("Bluefin returned an unsupported sponsored transaction.");
  if (built.coinOut) built.tx.transferObjects([built.coinOut], built.tx.pure.address(sender));
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
 * exact coins, exact size, 5% slippage; the tx is simulated before signing.
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
