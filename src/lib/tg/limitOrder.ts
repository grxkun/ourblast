// SPDX-License-Identifier: BUSL-1.1
/** Pure helpers for Telegram limit orders: buy when price drops to a target, sell when it rises to one. */
import { validSlippage } from "./chatTrade";

export const LIMIT_MAX_BUY_SUI = 1000;
export const LIMIT_MAX_OPEN = 10;
const COIN = "0x[a-f0-9]{1,64}::[a-z_][a-z0-9_]*::[a-z_][a-z0-9_]*";

export type LimitOrder = { side: "buy" | "sell"; amount: string; coinType: string; triggerUsd: string; slippage: string; stop?: boolean };
export type LimitCommand =
  | ({ op: "review" | "place" } & LimitOrder)
  | { op: "list" }
  | { op: "cancel"; id: string | "all" }
  | { op: "error"; error: string };

const USAGE = "Usage:\nlimit buy 5 sui of 0x…::coin::COIN at 0.0012\nlimit sell 50% 0x…::coin::COIN at 0.002\nstoploss 100% 0x…::coin::COIN at 0.0005\n(price in USD, optional: slippage 10%)";

export function parseLimitCommand(text: string): LimitCommand | null {
  const t = text.trim().replace(/^\//, "");
  if (/^(?:orders|limits|limit\s+orders)(?:@\w+)?$/i.test(t)) return { op: "list" };
  const c = t.match(/^cancel\s+(?:limit\s+)?(?:order\s+)?(all|[a-f0-9]{4,36})(?:\s+orders?)?$/i);
  if (c) return { op: "cancel", id: /^all$/i.test(c[1]!) ? "all" : c[1]!.toLowerCase() };
  const sl = t.match(new RegExp(`^(place\\s+)?(?:stoploss|stop\\s*loss|stop\\s+sell|sl)\\s+(\\d*\\.?\\d+)\\s*%\\s+(?:of\\s+)?(${COIN})\\s+(?:at|@)\\s*\\$?(\\d*\\.?\\d+)(?:\\s+(?:max\\s+)?slip(?:page)?\\s+(\\d*\\.?\\d+)\\s*%?)?\\s*$`, "i"));
  if (sl) {
    const [amount, coinType, triggerUsd, slippage = "15"] = [sl[2]!, sl[3]!, sl[4]!, sl[5]];
    if (!(Number(amount) > 0) || Number(amount) > 100) return { op: "error", error: "Sell percent must be 1–100%." };
    if (!(Number(triggerUsd) > 0)) return { op: "error", error: "Stop price must be above $0." };
    if (!validSlippage(Number(slippage))) return { op: "error", error: "Slippage must be between 0.1% and 50%." };
    return { op: sl[1] ? "place" : "review", side: "sell", amount, coinType, triggerUsd, slippage, stop: true };
  }
  const head = t.match(/^(place\s+)?limit\b/i);
  if (!head) return null;
  const re = new RegExp(`^(?:place\\s+)?limit\\s+(?:(buy)\\s+(\\d*\\.?\\d+)\\s*sui\\s+(?:of\\s+)?(${COIN})|(sell)\\s+(\\d*\\.?\\d+)\\s*%\\s+(?:of\\s+)?(${COIN}))\\s+(?:at|@|when\\s+price\\s*(?:<=|>=|hits)?)\\s*\\$?(\\d*\\.?\\d+)(?:\\s+(?:max\\s+)?slip(?:page)?\\s+(\\d*\\.?\\d+)\\s*%?)?\\s*$`, "i");
  const m = t.match(re);
  if (!m) {
    if (/^(?:place\s+)?limit\s+(buy|sell)\s+.*\$[a-z0-9]+/i.test(t)) return { op: "error", error: "Limit orders need the token's full contract (0x…::coin::COIN), not a $TICKER." };
    return { op: "error", error: USAGE };
  }
  const side = m[1] ? "buy" : "sell";
  const amount = (m[2] ?? m[5])!;
  const coinType = (m[3] ?? m[6])!;
  const triggerUsd = m[7]!;
  const slippage = m[8] ?? "5";
  if (!(Number(amount) > 0)) return { op: "error", error: "Amount must be above 0." };
  if (side === "buy" && Number(amount) > LIMIT_MAX_BUY_SUI) return { op: "error", error: `Max ${LIMIT_MAX_BUY_SUI} SUI per limit buy.` };
  if (side === "sell" && Number(amount) > 100) return { op: "error", error: "Sell percent must be 1–100%." };
  if (!(Number(triggerUsd) > 0)) return { op: "error", error: "Target price must be above $0." };
  if (!validSlippage(Number(slippage))) return { op: "error", error: "Slippage must be between 0.1% and 50%." };
  return { op: head[1] ? "place" : "review", side, amount, coinType, triggerUsd, slippage };
}

/** Canonical line kept in the review card (callback_data can't hold a contract). */
export const limitLine = (o: LimitOrder) => o.stop
  ? `place stoploss ${o.amount}% ${o.coinType} at ${o.triggerUsd} slippage ${o.slippage}%`
  : `place limit ${o.side === "buy" ? `buy ${o.amount} sui of` : `sell ${o.amount}%`} ${o.coinType} at ${o.triggerUsd} slippage ${o.slippage}%`;

/** Buys and stop-losses fire at or below the target; take-profit sells at or above. */
export const limitTriggered = (side: "buy" | "sell", trigger: number, price: number, stop = false) =>
  price > 0 && (side === "buy" || stop ? price <= trigger : price >= trigger);

export const TPSL_DEFAULT = { tp: 100, sl: 30 } as const;
/** Take-profit / stop-loss trigger prices from an entry price; tp/sl are percents (sl < 100). */
export function tpSlTargets(entry: number, tpPct: number | null, slPct: number | null): { tp: number | null; sl: number | null } {
  if (!(entry > 0)) return { tp: null, sl: null };
  const fix = (n: number) => Number(n.toPrecision(6));
  return { tp: tpPct && tpPct > 0 ? fix(entry * (1 + tpPct / 100)) : null, sl: slPct && slPct > 0 && slPct < 100 ? fix(entry * (1 - slPct / 100)) : null };
}

/** The trade command run when the order fires. */
export const limitTradeCommand = (o: { side: string; amount: string; coin_type: string; slippage: number | string }) =>
  o.side === "buy" ? `buy ${o.amount} sui of ${o.coin_type} slippage ${o.slippage}%` : `sell ${o.amount}% ${o.coin_type} slippage ${o.slippage}%`;

/** Percent of a position to sell so the proceeds repay its remaining cost (rest rides free). Null when the position isn't in profit. */
export function takeInitialPct(costSui: number, valueSui: number): number | null {
  if (!(costSui > 0) || !(valueSui > costSui)) return null;
  return Math.min(99, Math.max(1, Math.ceil((costSui / valueSui) * 1000) / 10));
}

export const TRAIL_PRESETS = [15, 25] as const;
/** Trailing stop: the stop price follows the highest price seen and fires once price falls trailPct below it. */
export function trailStep(peak: number, price: number, trailPct: number): { peak: number; fire: boolean } {
  const p = Math.max(peak, price);
  return { peak: p, fire: price > 0 && price <= p * (1 - trailPct / 100) };
}
