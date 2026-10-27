// SPDX-License-Identifier: BUSL-1.1
/** Average-cost PnL in SUI from confirmed OurBank swaps. Pure — no I/O. */
export const SUI_TYPE_SUFFIX = "::sui::SUI";
export interface SwapRow { side: string; coin_in: string; coin_out: string; amount_in: string; quoted_out: string | null; status: string }
export interface TokenPnl {
  coinType: string;
  boughtTokens: number; spentSui: number; soldTokens: number; receivedSui: number;
  avgCostSui: number | null; realizedSui: number;
}

const isSui = (t: string) => t.endsWith(SUI_TYPE_SUFFIX);

/** Swap rows store base units; `decimals` maps coinType → decimals (SUI = 9). Unconfirmed rows are ignored. */
export function computePnl(rows: SwapRow[], coinType: string, decimals: number): TokenPnl {
  const tok = (v: string | null) => Number(v ?? 0) / 10 ** decimals;
  const sui = (v: string | null) => Number(v ?? 0) / 1e9;
  let boughtTokens = 0, spentSui = 0, soldTokens = 0, receivedSui = 0, held = 0, cost = 0, realizedSui = 0;
  for (const r of rows) {
    if (r.status !== "CONFIRMED" || !r.quoted_out) continue;
    if (isSui(r.coin_in) && r.coin_out === coinType) {
      const t = tok(r.quoted_out), s = sui(r.amount_in);
      boughtTokens += t; spentSui += s; held += t; cost += s;
    } else if (r.coin_in === coinType && isSui(r.coin_out)) {
      const t = tok(r.amount_in), s = sui(r.quoted_out);
      soldTokens += t; receivedSui += s;
      const avg = held > 0 ? cost / held : 0;
      const matched = Math.min(t, held);
      realizedSui += s - matched * avg;
      held -= matched; cost -= matched * avg;
    }
  }
  return { coinType, boughtTokens, spentSui, soldTokens, receivedSui, avgCostSui: held > 0 ? cost / held : boughtTokens > 0 ? spentSui / boughtTokens : null, realizedSui };
}

/** Unrealized PnL of what's still held, valued at the live SUI price per token. */
export function unrealized(p: TokenPnl, heldTokens: number, priceSui: number | null): { valueSui: number; costSui: number; pnlSui: number; pct: number } | null {
  if (priceSui == null || p.avgCostSui == null || heldTokens <= 0) return null;
  const valueSui = heldTokens * priceSui, costSui = heldTokens * p.avgCostSui;
  return { valueSui, costSui, pnlSui: valueSui - costSui, pct: costSui > 0 ? ((valueSui - costSui) / costSui) * 100 : 0 };
}

const f = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: Math.abs(n) >= 1 ? 3 : 6 });
const sign = (n: number) => (n >= 0 ? "+" : "−") + f(Math.abs(n));

export function pnlLines(symbol: string, p: TokenPnl, held: number, priceSui: number | null, suiUsd: number | null): string[] {
  if (p.boughtTokens === 0 && p.soldTokens === 0) return [`📊 $${symbol}: no OurBank trades tracked yet — PnL starts from your next buy.`];
  const u = unrealized(p, held, priceSui);
  const usd = (s: number) => (suiUsd ? ` ($${(s * suiUsd).toFixed(2)})` : "");
  return [
    `📊 $${symbol} position`,
    `Held: ${f(held)}${u ? ` ≈ ${f(u.valueSui)} SUI${usd(u.valueSui)}` : ""}`,
    `Bought: ${f(p.boughtTokens)} for ${f(p.spentSui)} SUI${p.soldTokens ? ` · Sold: ${f(p.soldTokens)} for ${f(p.receivedSui)} SUI` : ""}`,
    ...(u ? [`${u.pnlSui >= 0 ? "🟢" : "🔴"} Unrealized: ${sign(u.pnlSui)} SUI${usd(u.pnlSui)} (${u.pct >= 0 ? "+" : ""}${u.pct.toFixed(1)}%)`] : held > 0 ? ["Unrealized: no live price"] : []),
    ...(p.soldTokens ? [`${p.realizedSui >= 0 ? "🏆" : "📉"} Realized: ${sign(p.realizedSui)} SUI${usd(p.realizedSui)}`] : []),
  ];
}

/** Shareable exit card after a sell. */
export function exitCard(symbol: string, p: TokenPnl, suiUsd: number | null): string | null {
  if (!p.soldTokens || p.spentSui <= 0) return null;
  const soldCost = p.soldTokens * (p.spentSui / Math.max(p.boughtTokens, 1e-18));
  const pct = soldCost > 0 ? (p.realizedSui / soldCost) * 100 : 0;
  const win = p.realizedSui >= 0;
  const usd = suiUsd ? ` ($${(p.realizedSui * suiUsd).toFixed(2)})` : "";
  return `${win ? "🏆" : "📉"} $${symbol} ${win ? "Win" : "Exit"} · ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% · ${win ? "Profit" : "PnL"}: ${sign(p.realizedSui)} SUI${usd}\nTraded on OURBLAST · t.me/ourblastsuibot`;
}
