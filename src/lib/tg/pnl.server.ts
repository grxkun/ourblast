// SPDX-License-Identifier: BUSL-1.1
import { computePnl, exitCard, pnlLines, pnlRow, unrealized, type SwapRow } from "./pnl";

const SUI = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";

async function load(handle: string) {
  const [{ ensureBankWallet }, { readSuiHoldings }, { aftermathPrices }, { supabaseAdmin: db }] = await Promise.all([
    import("@/lib/terminal/bank-wallet.server"), import("@/lib/terminal/sui-balances.server"),
    import("./runCommand.server"), import("@/integrations/supabase/client.server"),
  ]);
  const wallet = await ensureBankWallet(handle, null);
  const [raw, { data: rows }] = await Promise.all([
    readSuiHoldings(wallet.address),
    db.from("bank_swaps").select("side, coin_in, coin_out, amount_in, quoted_out, status").eq("wallet", wallet.address).eq("status", "CONFIRMED").order("created_at").limit(2000),
  ]);
  return { raw, rows: (rows ?? []) as SwapRow[], aftermathPrices };
}

/** Per-token position + PnL for one coin, from the user's main OurBank wallet. */
export async function tokenPnlReply(handle: string, coinType: string, symbol: string): Promise<string> {
  const { raw, rows, aftermathPrices } = await load(handle);
  const h = raw.find((b) => b.coinType === coinType);
  const decimals = h?.decimals ?? 9;
  const prices = await aftermathPrices([coinType, SUI]).catch(() => ({} as Record<string, number>));
  const suiUsd = prices[SUI] ?? null, tokUsd = prices[coinType] ?? null;
  const held = h ? Number(h.balance) / 10 ** decimals : 0;
  const p = computePnl(rows, coinType, decimals);
  return pnlLines(symbol, p, held, tokUsd != null && suiUsd ? tokUsd / suiUsd : null, suiUsd).join("\n");
}

/** Realized exit card for a token, appended after a confirmed sell. */
export async function exitCardFor(handle: string, coinType: string, symbol: string): Promise<string | null> {
  const { raw, rows, aftermathPrices } = await load(handle);
  const decimals = raw.find((b) => b.coinType === coinType)?.decimals ?? 9;
  const suiUsd = (await aftermathPrices([SUI]).catch(() => ({} as Record<string, number>)))[SUI] ?? null;
  return exitCard(symbol, computePnl(rows, coinType, decimals), suiUsd);
}

/** PnL lines for every token position. */
export async function positionsPnl(handle: string): Promise<string> {
  const { raw, rows, aftermathPrices } = await load(handle);
  const toks = raw.filter((b) => !b.coinType.endsWith("::sui::SUI") && Number(b.balance) > 0);
  if (!toks.length) return "📊 No token positions yet. Paste a $TICKER or contract to buy.";
  const prices = await aftermathPrices([SUI, ...toks.map((t) => t.coinType)]).catch(() => ({} as Record<string, number>));
  const suiUsd = prices[SUI] ?? null;
  const blocks = toks.map((b) => {
    const d = b.decimals ?? 9, held = Number(b.balance) / 10 ** d;
    const pu = prices[b.coinType];
    return pnlRow(b.symbol ?? b.coinType.split("::").at(-1) ?? "Token", computePnl(rows, b.coinType, d), held, pu != null && suiUsd ? pu / suiUsd : null);
  });
  return [`📊 Positions (main wallet)`, "", blocks.join("\n"), "", "% = unrealized · R = realized SUI. Detail: paste CA"].join("\n");
}

/** Remaining cost vs. live value of one position, for "take initial". */
export async function positionValue(handle: string, coinType: string): Promise<{ costSui: number; valueSui: number } | null> {
  const { raw, rows, aftermathPrices } = await load(handle);
  const h = raw.find((b) => b.coinType === coinType);
  if (!h) return null;
  const d = h.decimals ?? 9;
  const prices = await aftermathPrices([coinType, SUI]).catch(() => ({} as Record<string, number>));
  const pu = prices[coinType], su = prices[SUI];
  const u = unrealized(computePnl(rows, coinType, d), Number(h.balance) / 10 ** d, pu != null && su ? pu / su : null);
  return u ? { costSui: u.costSui, valueSui: u.valueSui } : null;
}

/** Non-SUI tokens held in the main wallet, in display order. */
export async function heldTokens(handle: string): Promise<{ symbol: string; coinType: string }[]> {
  const { raw } = await load(handle);
  return raw.filter((b) => !b.coinType.endsWith("::sui::SUI") && Number(b.balance) > 0).map((b) => ({ symbol: b.symbol ?? b.coinType.split("::").at(-1) ?? "Token", coinType: b.coinType }));
}
