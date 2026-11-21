// SPDX-License-Identifier: BUSL-1.1
/** Telegram limit orders: stored after the user confirms, filled by the poll loop when Aftermath's live price hits the target. */
import { LIMIT_MAX_OPEN, limitTradeCommand, limitTriggered, tpSlTargets, type LimitOrder } from "./limitOrder";

async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
const sym = (ct: string) => `$${ct.split("::").pop()}`;
const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumSignificantDigits: 6 })}`;

export async function currentPrice(coinType: string): Promise<number | null> {
  const { aftermathPrices } = await import("./runCommand.server");
  return (await aftermathPrices([coinType]))[coinType] ?? null;
}

export async function limitReview(o: LimitOrder, walletCount: number): Promise<string> {
  const p = await currentPrice(o.coinType);
  const t = Number(o.triggerUsd);
  const what = o.stop ? `Stop-loss: sell ${o.amount}% of ${sym(o.coinType)} when price ≤ ${usd(t)}` : o.side === "buy" ? `Buy ${o.amount} SUI of ${sym(o.coinType)} when price ≤ ${usd(t)}` : `Sell ${o.amount}% of ${sym(o.coinType)} when price ≥ ${usd(t)}`;
  const now = p == null ? "Current price: unavailable — the order only fires once a live price is found." : `Current price: ${usd(p)}${limitTriggered(o.side, t, p, o.stop) ? " (already past target — fills on the next check)" : ""}`;
  return `⏱ Limit order review\n${what}\n${o.coinType}\n${now}\nWallets: ${walletCount} · slippage ${o.slippage}% · expires in 7 days\nRuns automatically from your OurBank wallet(s) when hit.`;
}

export async function placeLimitOrder(tgUserId: number, o: LimitOrder, slots: number[]): Promise<string> {
  const d = await db();
  const { count } = await d.from("tg_limit_orders").select("id", { count: "exact", head: true }).eq("tg_user_id", tgUserId).eq("status", "open");
  if ((count ?? 0) >= LIMIT_MAX_OPEN) return `You have ${LIMIT_MAX_OPEN} open orders (the max). Cancel one first: orders`;
  const { data, error } = await d.from("tg_limit_orders").insert({
    tg_user_id: tgUserId, side: o.side, coin_type: o.coinType, amount: o.amount, trigger_usd: Number(o.triggerUsd), slippage: Number(o.slippage), slots, stop: !!o.stop,
  }).select("id").single();
  if (error || !data) return "Couldn't save the order. Nothing was placed.";
  const what = o.stop ? `Sell ${o.amount}% of ${sym(o.coinType)} if price falls to` : `${o.side === "buy" ? `Buy ${o.amount} SUI` : `Sell ${o.amount}%`} of ${sym(o.coinType)} at`;
  return `✅ ${o.stop ? "Stop-loss" : "Limit order"} placed (#${data.id.slice(0, 6)})\n${what} ${usd(Number(o.triggerUsd))} · wallets ${slots.map((s) => `w${s}`).join(", ")}\nYou'll get a receipt when it fills. See: orders · cancel ${data.id.slice(0, 6)}`;
}

export async function listLimitOrders(tgUserId: number): Promise<string> {
  const { data } = await (await db()).from("tg_limit_orders").select("id, side, coin_type, amount, trigger_usd, slots, expires_at, stop, oco")
    .eq("tg_user_id", tgUserId).eq("status", "open").order("created_at");
  if (!data?.length) return "No open limit orders.\nTry: limit buy 5 sui of 0x…::coin::COIN at 0.0012";
  return `⏱ Open limit orders (${data.length}/${LIMIT_MAX_OPEN})\n\n${data.map((o) =>
    `#${o.id.slice(0, 6)} · ${o.stop ? `🛑 stop-loss ${o.amount}%` : o.oco ? `🎯 take-profit ${o.amount}%` : o.side === "buy" ? `buy ${o.amount} SUI` : `sell ${o.amount}%`} ${sym(o.coin_type)} at ${usd(Number(o.trigger_usd))} · ${o.slots.map((s) => `w${s}`).join(",")}`).join("\n")}\n\nCancel: cancel <#id> · cancel all`;
}

export async function cancelLimitOrders(tgUserId: number, id: string | "all"): Promise<string> {
  const d = await db();
  const { data: open } = await d.from("tg_limit_orders").select("id").eq("tg_user_id", tgUserId).eq("status", "open");
  const ids = (open ?? []).map((o) => o.id).filter((x) => id === "all" || x.startsWith(id));
  if (!ids.length) return "No open order matched.";
  if (id !== "all" && ids.length > 1) return "That matches more than one order — use a longer id.";
  const { data } = await d.from("tg_limit_orders").update({ status: "cancelled" }).in("id", ids).eq("status", "open").select("id");
  return `🛑 Cancelled ${data?.length ?? 0} order(s). Nothing was traded.`;
}

/** Poll step: expire stale orders, then fill triggered ones. Each order is claimed open→filling so it runs once. */
export async function maintainLimitOrders() {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  const d = await db();
  await d.from("tg_limit_orders").update({ status: "expired" }).eq("status", "open").lt("expires_at", new Date().toISOString());
  const { data: orders } = await d.from("tg_limit_orders").select("id, tg_user_id, side, coin_type, amount, trigger_usd, slippage, slots, stop, oco").eq("status", "open").limit(200);
  if (!orders?.length) return;
  const { aftermathPrices, runTgCommand } = await import("./runCommand.server");
  const prices = await aftermathPrices([...new Set(orders.map((o) => o.coin_type))]);
  const say = (chat_id: number, text: string) => token ? fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id, text: text.slice(0, 4000), disable_web_page_preview: true }) }) : null;
  for (const o of orders) {
    const p = prices[o.coin_type];
    if (p == null || !limitTriggered(o.side as "buy" | "sell", Number(o.trigger_usd), p, !!o.stop)) continue;
    const { data: claimed } = await d.from("tg_limit_orders").update({ status: "filling" }).eq("id", o.id).eq("status", "open").select("id");
    if (!claimed?.length) continue;
    // One-cancels-other: a take-profit and its stop-loss never both sell.
    if (o.oco) await d.from("tg_limit_orders").update({ status: "cancelled" }).eq("oco", o.oco).eq("status", "open");
    const out = await runTgCommand(Number(o.tg_user_id), limitTradeCommand({ ...o, amount: o.amount, slippage: Number(o.slippage) }), null, { slots: o.slots })
      .then((r) => r.reply).catch((e) => `Failed: ${(e as Error).message}. Nothing was sent unless a transaction link is shown.`);
    const ok = /suiscan|suivision|tx\//i.test(out);
    await d.from("tg_limit_orders").update({ status: ok ? "filled" : "failed", result: out.slice(0, 2000), filled_at: new Date().toISOString() }).eq("id", o.id);
    await say(Number(o.tg_user_id), `${o.stop ? "🛑 Stop-loss" : o.oco ? "🎯 Take-profit" : `⏱ Limit ${o.side}`} #${o.id.slice(0, 6)} triggered at ${usd(p)}\n${out}`);
  }
}

/** After a snipe buy: place a linked take-profit + stop-loss (one cancels the other) for 100% of the position. */
export async function placeTpSl(tgUserId: number, coinType: string, tpPct: number | null, slPct: number | null, slots: number[], slippage = 15): Promise<string> {
  const entry = await currentPrice(coinType);
  if (entry == null) return "TP/SL not set: no live price yet. Try later: sell buttons or stoploss 100% <contract> at <price>.";
  const t = tpSlTargets(entry, tpPct, slPct);
  if (t.tp == null && t.sl == null) return "TP/SL not set.";
  const d = await db();
  const { count } = await d.from("tg_limit_orders").select("id", { count: "exact", head: true }).eq("tg_user_id", tgUserId).eq("status", "open");
  if ((count ?? 0) + (t.tp && t.sl ? 2 : 1) > LIMIT_MAX_OPEN) return `TP/SL not set: you have ${count} open orders (max ${LIMIT_MAX_OPEN}). Cancel some: orders`;
  const oco = crypto.randomUUID();
  const base = { tg_user_id: tgUserId, side: "sell", coin_type: coinType, amount: "100", slippage, slots, oco };
  const rows = [...(t.tp ? [{ ...base, trigger_usd: t.tp, stop: false }] : []), ...(t.sl ? [{ ...base, trigger_usd: t.sl, stop: true }] : [])];
  const { error } = await d.from("tg_limit_orders").insert(rows);
  if (error) return "TP/SL not set: couldn't save. Nothing changed.";
  return `🎯 TP/SL set from entry ${usd(entry)}: ${t.tp ? `take-profit ${usd(t.tp)} (+${tpPct}%)` : ""}${t.tp && t.sl ? " · " : ""}${t.sl ? `stop-loss ${usd(t.sl)} (−${slPct}%)` : ""}\nSells 100% when hit; the other side cancels. See: orders`;
}
