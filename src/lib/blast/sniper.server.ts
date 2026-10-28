// SPDX-License-Identifier: BUSL-1.1
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { normalizeStructTag, normalizeSuiAddress } from "@mysten/sui/utils";
import { minimumSnipeOutput } from "./advisor";

/** Actual selected wallet, unsigned simulation only. Re-run at confirmation; never submits. */
export async function sniperPreflight(handle: string, coinType: string, amount: string, slippage: string): Promise<{ ok: boolean; reply: string }> {
  try {
    const [{ findBankWallet }, { pickSwapRoute }, { toAtomic }, { readCoinMetadata }] = await Promise.all([
      import("@/lib/terminal/bank-wallet.server"), import("@/lib/terminal/bank-swap.server"), import("@/lib/terminal/bank"), import("@/lib/terminal/sui-balances.server"),
    ]);
    const wallet = await findBankWallet(handle);
    if (!wallet) return { ok: false, reply: "No funded OurBank wallet found. Open Wallet first." };
    const token = normalizeStructTag(coinType), sui = normalizeStructTag("0x2::sui::SUI");
    const route = await pickSwapRoute(wallet.address, sui, token, toAtomic(amount, 9), false, false, Number(slippage) / 100);
    if (!route.ok) return { ok: false, reply: `Snipe blocked: ${route.error}` };
    const tx = route.built.tx;
    tx.setSender(wallet.address);
    tx.setGasBudget(50_000_000n);
    const client = new SuiGraphQLClient({ url: "https://graphql.mainnet.sui.io/graphql", network: "mainnet" });
    const bytes = await tx.build({ client });
    const simulation = await client.core.simulateTransaction({ transaction: bytes, include: { balanceChanges: true } });
    if (simulation.$kind !== "Transaction" || simulation.Transaction.status.success !== true) return { ok: false, reply: "Snipe blocked: unsigned simulation failed. No funds moved." };
    const change = simulation.Transaction.balanceChanges.find((c) => normalizeSuiAddress(c.address) === normalizeSuiAddress(wallet.address) && normalizeStructTag(c.coinType) === token);
    const expected = BigInt(change?.amount ?? "0"), min = minimumSnipeOutput(expected, Number(slippage));
    const meta = await readCoinMetadata(token);
    const amountNote = meta ? `${Number(expected) / 10 ** meta.decimals} $${meta.symbol}` : `${expected} token base units`;
    return { ok: true, reply: `Unsigned preflight passed · ${route.built.venue}\nExpected net: ${amountNote}\nMinimum protected output: ${min} base units · max slippage ${slippage}%\n${route.built.venue === "Blast.fun" ? "Historical MemezFun route; newer Blast v2 opening-round/vesting rules not assumed.\n" : ""}Simulation is not a safety audit or guaranteed fill. Rechecked at confirmation; nothing submitted.` };
  } catch (e) { return { ok: false, reply: `Snipe blocked: ${e instanceof Error ? e.message : "state/simulation unavailable"}. No funds moved.` }; }
}