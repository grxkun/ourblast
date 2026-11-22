// SPDX-License-Identifier: BUSL-1.1
import { tgWalletHandle } from "@/lib/tg/tgIdentity.server";
import type { TelegramUpdate } from "./webhookDelivery";

import { MAX_FOLLOWS, parseFollowCommand } from "@/lib/tg/walletWatch";
import { actionCoinType, actionCommand, BUY_PRESETS, decodeAction, detectToken, encodeAction, parseSnipeCommand, SELL_PRESETS } from "@/lib/tg/chatTrade";
import { buyDeepLink, contractDeepLink, parseStartContract, deckKeyboard, DEFAULT_DECK_SLIP, findScanTarget, parseDeckTap, parseStartBuy, richScanCard, toggleSlot } from "@/lib/tg/scanner";
import { mainToken } from "@/lib/terminal/mainTokens";
import { decodePresaleAction, encodePresaleAction, parsePresaleCommand, presaleIdFromText } from "@/lib/tg/presale";

const APP_URL = "https://ourblast.xyz/tg";
const LINK_URL = "https://ourblast.xyz/tg?tab=wallet";
/** The real ticker shown on a card ($HOLMOT), not the shared struct name some launchpads use. */
const cardSymbol = (text: string, fallback: string) => text.split("\n")[0]?.match(/\$([A-Za-z0-9_]{1,16})/)?.[1]?.toUpperCase() ?? fallback;
/** On-chain ticker for a coin type (Suipump coins all share ::suipump::SUIPUMP); falls back if metadata is unreadable. */
async function realSymbol(coinType: string | null | undefined, fallback: string): Promise<string> {
  if (!coinType) return fallback;
  const meta = await (await import("@/lib/terminal/sui-balances.server")).readCoinMetadata(coinType).catch(() => null);
  return meta?.symbol ? meta.symbol.toUpperCase().slice(0, 16) : fallback;
}
const CUSTOM_BUY_PROMPT = "✏️ Reply with how much SUI to spend on";
const CUSTOM_SELL_PROMPT = "✏️ Reply with what % to sell of";
type Btn = { text: string; callback_data?: string; web_app?: { url: string }; url?: string };

function tokenKeyboard(symbol: string): Btn[][] {
  return [
    BUY_PRESETS.map((a) => ({ text: `Buy ${a} SUI`, callback_data: encodeAction({ kind: "ask", side: "buy", amount: a, symbol }) })),
    SELL_PRESETS.map((a) => ({ text: a === "100" ? "Sell MAX" : `Sell ${a}%`, callback_data: encodeAction({ kind: "ask", side: "sell", amount: a, symbol }) })),
    [{ text: "Open OURBLAST", web_app: { url: APP_URL } }],
  ];
}


/** BasedBot-style deck for a user's private chat: their wallets + selection, chosen slippage, chart links. */
async function userDeck(tgUserId: number, symbol: string, coinType: string, slip = DEFAULT_DECK_SLIP, selectedOverride?: number[]): Promise<Btn[][]> {
  let slots = [1], selected = [1];
  try {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const u = { x_username: await tgWalletHandle(tgUserId) as string | null };
    if (u?.x_username) {
      const { listTgWallets } = await import("@/lib/tg/tgWallets.server");
      const r = await listTgWallets(tgUserId, u.x_username);
      slots = r.wallets.map((w) => w.slot); selected = r.selected;
    }
  } catch { /* fall back to W1 only */ }
  return [
    ...deckKeyboard({ symbol, slots, selected: selectedOverride ?? selected, slip, encode: (side, amount, sl) => encodeAction({ kind: "ask", side, amount, symbol, slippage: sl }) }),
    [{ text: "🔄 Refresh", callback_data: `ts|${slip}` }, { text: "Open OURBLAST", web_app: { url: APP_URL } }],
  ];
}

/** Private-chat dashboard: one tap per feature. Read-only views run directly; anything that spends shows how-to first. */
function dashboardKeyboard(handle: string | null): Btn[][] {
  return [
    ...(handle ? [] : [[{ text: "🔗 Link X account", web_app: { url: LINK_URL } }]]),
    [{ text: "💰 Balance", callback_data: "m:balance" }, { text: "👛 Wallet", callback_data: "m:wallet" }, { text: "📊 Positions", callback_data: "m:positions" }],
    [{ text: "🟢 Buy", callback_data: "m:buy" }, { text: "🔴 Sell", callback_data: "m:sell" }, { text: "🎯 Snipe", callback_data: "m:snipe" }],
    [{ text: "🪞 Copy", callback_data: "m:copy" }, { text: "👀 Alerts", callback_data: "m:alerts" }, { text: "⏱ Limit", callback_data: "m:limit" }],
    [{ text: "🚀 Presales", callback_data: "m:presales" }, { text: "🌉 Bridge", callback_data: "m:bridge" }, { text: "📤 Send", callback_data: "m:send" }],
    [{ text: "👛 Wallets", callback_data: "m:wallets" }, { text: "📋 Orders", callback_data: "m:orders" }, { text: "🌉 Bridges", callback_data: "m:bridges" }],
    [{ text: "⚡ Open OURBLAST app", web_app: { url: APP_URL } }],
  ];
}

function dashboardText(handle: string | null): string {
  return `💥 OURBLAST dashboard\nTap a button to use it. Anything that spends asks you to confirm first.\n\n${handle ? `✅ Linked to X @${handle}` : "✅ Telegram wallet active & ready to trade. Linking X is optional (syncs with the website)."}`;
}

/** BasedBot-style wallet grid: tap W2…W6 to toggle which wallets trade, ✅ marks selected, All selects every wallet. */
async function walletPicker(tgUserId: number, handle: string): Promise<{ text: string; kb: Btn[][] }> {
  const { walletsReply, listTgWallets } = await import("@/lib/tg/tgWallets.server");
  const [text, { wallets, selected }] = await Promise.all([walletsReply(tgUserId, handle), listTgWallets(tgUserId, handle)]);
  const cells: Btn[] = wallets.map((w) => ({ text: `${selected.includes(w.slot) ? "✅ " : ""}W${w.slot}`, callback_data: `ws:${w.slot}` }));
  if (wallets.length < 6) cells.push({ text: "➕ New", callback_data: "ws:new" });
  cells.push({ text: "All", callback_data: "ws:all" });
  const rows: Btn[][] = [];
  for (let i = 0; i < cells.length; i += 4) rows.push(cells.slice(i, i + 4));
  return {
    text: text.split("\n\n✅ = ")[0] + "\n\nTap a wallet to turn trading on/off for it. ✅ = trades run from it.",
    kb: [
      [{ text: "🔀 Move", callback_data: "ws:move" }, { text: "📤 Withdraw", callback_data: "ws:out" }, { text: "🧲 Consolidate", callback_data: "ws:merge" }],
      ...rows,
      [{ text: "🔐 Backup key", callback_data: "ws:backup" }],
      [{ text: "⬅️ Menu", callback_data: "m:home" }],
    ],
  };
}

const HOLDINGS_KB: Btn[][] = [[{ text: "🎛 Exit a token (sell · take initial · trail)", callback_data: "xl" }], [{ text: "🔄 Refresh", callback_data: "m:positions" }, { text: "🎯 Sniper", callback_data: "m:snipe" }], [{ text: "📋 Orders", callback_data: "m:orders" }, { text: "⬅️ Menu", callback_data: "m:home" }]];
const SNIPE_MENU_TEXT = "🎯 Sniper\n\n• Target: snipe 0x…::coin::COIN 5 sui slippage 10% — one token, review then confirm.\n• ⚡ All launches by filter: buy every new Blast.fun / Suipump launch automatically, with a per-launch size and daily max.\n  Custom: autosnipe all 2 sui max 10 sui slippage 15% keyword pepe\n\nPick a quick rule below — you always review before it turns on.\n📡 Holdings shows every token you hold with live value and PnL.";
function snipeMenuKeyboard(): Btn[][] {
  return [
    [{ text: "⚡ All · 1 SUI", callback_data: "sa|all|1" }, { text: "⚡ All · 2 SUI", callback_data: "sa|all|2" }, { text: "⚡ All · 5 SUI", callback_data: "sa|all|5" }],
    [{ text: "💥 Blast.fun · 2 SUI", callback_data: "sa|blast|2" }, { text: "🚀 Suipump · 2 SUI", callback_data: "sa|suipump|2" }],
    [{ text: "🎯 All 2 SUI + TP100/SL30", callback_data: "sa|all|2|t" }, { text: "🎯 Blast 1 SUI + TP100/SL30", callback_data: "sa|blast|1|t" }],
    [{ text: "📋 My rules", callback_data: "asl" }, { text: "⏸ Pause all", callback_data: "asp" }, { text: "🛑 Stop all", callback_data: "ass" }],
    [{ text: "📡 Holdings", callback_data: "m:positions" }, { text: "📋 Orders", callback_data: "m:orders" }, { text: "👛 Wallets", callback_data: "m:wallets" }],
    [{ text: "⬅️ Menu", callback_data: "m:home" }],
  ];
}
async function sendAutoReview(tg: (m: string, b: Record<string, unknown>) => Promise<unknown>, chat_id: number, tgUserId: number, r: import("@/lib/tg/autoSnipe").AutoRule) {
  const [{ autoLine }, as, h] = await Promise.all([import("@/lib/tg/autoSnipe"), import("@/lib/tg/autoSnipe.server"), tgWalletHandle(tgUserId)]);
  if (!h) { await tg("sendMessage", { chat_id, text: "🔗 Link your account first (open the app → Wallet)." }); return; }
  const { listTgWallets } = await import("@/lib/tg/tgWallets.server");
  const { selected } = await listTgWallets(tgUserId, h);
  await tg("sendMessage", {
    chat_id, disable_web_page_preview: true,
    text: `${await as.autoSnipeReview(r, selected.length)}\nWallets: ${selected.map((s) => `w${s}`).join(", ")}\n\n${autoLine(r)}`,
    reply_markup: { inline_keyboard: [[{ text: "✅ Turn on auto-snipe", callback_data: "as" }, { text: "Cancel", callback_data: "x" }]] },
  });
}

const MENU_HOWTO: Record<string, string> = {
  buy: "🟢 Buy\nPaste a token contract (0x…::coin::COIN) or $TICKER — I'll show Buy buttons.\nOr type: buy 1 sui of $BLAST",
  sell: "🔴 Sell\nType: sell 50% $BLAST · sell all $BLAST\nOr paste a token contract to get Sell buttons.",
  snipe: "🎯 Snipe\nType: snipe 0x…::coin::COIN 5 sui slippage 10%\nFull contract required. You review, then confirm.",
  copy: "🪞 Copy trade\nType: copy 0x… 2 sui max 10 sui slippage 10%\nRuns automatically after you confirm, within your daily max. Stop: stopcopy all",
  alerts: "👀 Wallet alerts\nfollow 0x… name — get alerts on its trades\n/following — your list · unfollow 0x…",
  limit: "⏱ Limit orders\nlimit buy 5 sui of 0x…::coin::COIN at 0.0012 — buys when price ≤ target\nlimit sell 50% 0x…::coin::COIN at 0.002 — sells when price ≥ target\nPrices in USD (Aftermath). You review, then confirm. /orders · cancel <id> · cancel all",
  wallets: "👛 Multi-wallet\n/wallets — list your Sui wallets\nnewwallet sniper — add one (up to 6)\nuse 1,2 · use all — trades run from each selected wallet\nw2 sell 50% 0x… — one wallet only",
  presales: "🚀 Presales\nType: presales — browse live Blast.fun presales\npresale 0x… — details · commit 5 sui to 0x… (confirm first)",
  bridge: "🌉 Bridge\nbridge 0.05 sol to sui · bridge 0.02 bnb to sui · bridge 10 sui to sol\nDeposits never move without your command.",
  send: "📤 Send\nsend 5 sui to name.sui · send 10 $BLAST to @friend\nMultiple: send 22 $HOLMOT, 10 $BLAST to name.sui",
};

/** Bridge preset codes → the exact command run after the user taps Confirm (keeps callback data short). */
const BRIDGE_PRESETS: Record<string, string> = {
  s05: "bridge 0.05 sol to sui", s1: "bridge 0.1 sol to sui", sall: "bridge all sol to sui",
  b02: "bridge 0.02 bnb to sui", b05: "bridge 0.05 bnb to sui", ball: "bridge all bnb to sui",
  eb5: "bridge 0.005 eth on base to sui", eb10: "bridge 0.01 eth on base to sui", eball: "bridge all eth on base to sui",
  ea5: "bridge 0.005 eth on arbitrum to sui", ea10: "bridge 0.01 eth on arbitrum to sui", eaall: "bridge all eth on arbitrum to sui",
  os10: "bridge 10 sui to sol", os25: "bridge 25 sui to sol",
  ob10: "bridge 10 sui to bnb", ob25: "bridge 25 sui to bnb",
  oe10: "bridge 10 sui to eth on base", oe25: "bridge 25 sui to eth on base",
  oa10: "bridge 10 sui to eth on arbitrum", oa25: "bridge 25 sui to eth on arbitrum",
  or10: "bridge 10 sui to eth on robinhood", or25: "bridge 25 sui to eth on robinhood",
};

const BR_CHAINS: Record<string, { dir: "in" | "out"; label: string; codes: [string, string][] }> = {
  s: { dir: "in", label: "◎ Solana (SOL)", codes: [["s05", "0.05 SOL"], ["s1", "0.1 SOL"], ["sall", "All SOL"]] },
  b: { dir: "in", label: "🟡 BNB Chain (BNB)", codes: [["b02", "0.02 BNB"], ["b05", "0.05 BNB"], ["ball", "All BNB"]] },
  eb: { dir: "in", label: "🔵 Base (ETH)", codes: [["eb5", "0.005 ETH"], ["eb10", "0.01 ETH"], ["eball", "All ETH"]] },
  ea: { dir: "in", label: "🔷 Arbitrum (ETH)", codes: [["ea5", "0.005 ETH"], ["ea10", "0.01 ETH"], ["eaall", "All ETH"]] },
  os: { dir: "out", label: "◎ Solana (SOL)", codes: [["os10", "10 SUI"], ["os25", "25 SUI"]] },
  ob: { dir: "out", label: "🟡 BNB Chain (BNB)", codes: [["ob10", "10 SUI"], ["ob25", "25 SUI"]] },
  oe: { dir: "out", label: "🔵 Base (ETH)", codes: [["oe10", "10 SUI"], ["oe25", "25 SUI"]] },
  oa: { dir: "out", label: "🔷 Arbitrum (ETH)", codes: [["oa10", "10 SUI"], ["oa25", "25 SUI"]] },
  or: { dir: "out", label: "🟢 Robinhood Chain (ETH)", codes: [["or10", "10 SUI"], ["or25", "25 SUI"]] },
};
const chainOf = (code: string) => Object.entries(BR_CHAINS).find(([, c]) => c.codes.some(([k]) => k === code))?.[0];
const NAV = (back: string): Btn[] => [{ text: "⬅️ Back", callback_data: back }, { text: "❌ Cancel", callback_data: "br:home" }];

/** Cascading bridge flow: (1/4) direction → (2/4) chain → (3/4) amount → (4/4) review → confirm. */
function bridgeStep(step: "home" | "in" | "out" | string): { text: string; kb: Btn[][] } {
  if (step === "home") return {
    text: "🌉 Bridge (1/4) — Direction\nMove funds into or out of your OurBank Sui wallet.\nDeposits never move without your command.",
    kb: [[{ text: "📥 Bridge in → SUI", callback_data: "br:d:in" }, { text: "📤 Bridge out of SUI", callback_data: "br:d:out" }],
      [{ text: "📡 Live status", callback_data: "br:r" }, { text: "📜 History", callback_data: "br:t:hist" }], [{ text: "📍 Addresses", callback_data: "br:t:addr" }, { text: "⬅️ Menu", callback_data: "m:home" }]],
  };
  if (step === "in" || step === "out") {
    const rows = Object.entries(BR_CHAINS).filter(([, c]) => c.dir === step).map(([k, c]) => [{ text: c.label, callback_data: `br:c:${k}` }]);
    return {
      text: step === "in" ? "🌉 Bridge in (2/4) — Source chain\nPick where the funds are now (your OurBank deposit address)." : "🌉 Bridge out (2/4) — Destination chain\nSUI → chosen chain. Min 5 SUI, 0.1 kept for gas. ETH/BNB hop via your Solana address.",
      kb: [...rows, NAV("br:home")],
    };
  }
  const c = BR_CHAINS[step];
  if (!c) return bridgeStep("home");
  return {
    text: `🌉 ${c.dir === "in" ? "Bridge in" : "Bridge out"} (3/4) — Amount\n${c.dir === "in" ? `${c.label} → SUI` : `SUI → ${c.label}`}\n${c.dir === "in" ? "Mins: 0.02 SOL · 0.01 BNB · 0.0015 ETH (gas kept)." : "Amounts in SUI."}\nOther amount? Type e.g. ${BRIDGE_PRESETS[c.codes[0]![0]]!.replace(/[\d.]+|all/, "0.07")}`,
    kb: [c.codes.map(([k, t]) => ({ text: t, callback_data: `br:p:${k}` })), NAV(`br:d:${c.dir}`)],
  };
}

function progressCard(i: { label: string; state: string; detail: string; links: { text: string; href: string }[]; createdAt: string } | undefined): string {
  if (!i) return "📡 Live status\nNo bridges yet.";
  const n = i.state === "done" ? 5 : i.state === "failed" ? 5 : /hop|Second|Final|Bridging/i.test(i.detail) ? 3 : 2;
  const bar = (i.state === "failed" ? "🟥" : "🟩").repeat(n) + "⬜".repeat(5 - n);
  const head = i.state === "done" ? "✅ Done" : i.state === "failed" ? "❌ Failed" : "⏳ In progress";
  return `📡 Live status — latest bridge\n${i.label}\n${bar} ${head}\n${i.detail}\nStarted ${new Date(i.createdAt).toISOString().slice(5, 16).replace("T", " ")} UTC\nChecked ${new Date().toISOString().slice(11, 19)} UTC${i.links.map((l) => `\n${l.text}: ${l.href}`).join("")}`;
}


export async function processTelegramUpdate(update: TelegramUpdate, token: string): Promise<Response> {
        let threadId: number | undefined;
        const tg = async (method: string, body: Record<string, unknown>): Promise<number | undefined> => {
          // Threaded bot chats: reply inside the same topic or Telegram hides it.
          if (threadId && (method === "sendMessage" || method === "sendChatAction" || method === "sendPhoto")) body = { ...body, message_thread_id: threadId };
          const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
          });
          if (!res.ok) {
            console.error(`Telegram ${method} failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
            return undefined;
          }
          const j = (await res.json().catch(() => null)) as { result?: { message_id?: number } } | null;
          return j?.result?.message_id;
        };
        /** Shows "⏳ note" right away, then replaces it with the final reply (falls back to a new message). */
        const replyWithProgress = async (chat_id: number, note: string, work: () => Promise<string>, kb?: Btn[][]) => {
          // Start the work at once; the placeholder is sent alongside it instead of before it.
          const started = Date.now();
          const workP = work().catch((e) => `❌ Failed: ${(e as Error).message}. Status is unconfirmed. Check your wallet and history before retrying; a transfer may already have been submitted.`);
          const [pid] = await Promise.all([tg("sendMessage", { chat_id, text: `⏳ ${note}…` }), tg("sendChatAction", { chat_id, action: "typing" })]);
          const text = await workP;
          console.log(`tg command done in ${Date.now() - started}ms`);
          const body = { chat_id, text: text.slice(0, 4000), disable_web_page_preview: true, ...(kb ? { reply_markup: { inline_keyboard: kb } } : {}) };
          if (pid && (await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, message_id: pid }),
          })).ok) return;
          await tg("sendMessage", body);
        };

        /** /chart reply: candle image, or a clear reason + Retry / timeframe buttons. Read-only. */
        const sendChart = async (chatId: number, t: { symbol: string; coinType: string }, tf: string, replyTo: number | undefined): Promise<void> => {
          const { getScanStats } = await import("@/lib/tg/scanInfo.server");
          const { topPool, candles, renderChart, yoloCandles } = await import("@/lib/tg/chart.server");
          const { fmtUsd, fmtPrice, chartLinksHtml } = await import("@/lib/tg/scanner");
          const [stats, pool] = await Promise.all([getScanStats(t.coinType).catch(() => null), topPool(t.coinType).catch(() => null)]);
          const sym = (stats?.symbol ?? t.symbol).toUpperCase().slice(0, 16);
          const chg = stats?.change24h != null ? ` · 24h ${stats.change24h >= 0 ? "+" : ""}${stats.change24h.toFixed(1)}%` : "";
          const caption = `📊 <b>$${sym}</b> · ${tf}\nPrice ${fmtPrice(stats?.priceUsd ?? null)} · MC ${fmtUsd(stats?.mcap)}${chg}\n<code>${t.coinType}</code>\n${chartLinksHtml(t.coinType)}`;
          let list = stats?.onCurve || !pool ? [] : await candles(pool, tf, t.coinType).catch(() => []);
          // Unbonded (or DEX feed empty): bonding-curve candles from YOLO.casa.
          if (list.length < 3) { const y = await yoloCandles(t.coinType, tf).catch(() => []); if (y.length >= 3) list = y; }
          const img = list.length >= 3 ? await renderChart(sym, tf, list).catch(() => null) : null;
          const buyUrl = mainToken(sym)?.coinType === t.coinType ? buyDeepLink(sym) : contractDeepLink(t.coinType);
          const tfRow = ["15m", "1h", "4h"].map((x) => ({ text: x === tf ? `• ${x}` : x, callback_data: `chr:${x}` }));
          const rows: { text: string; url?: string; callback_data?: string }[][] = [tfRow];
          if (buyUrl) rows.push([{ text: `🟢 Buy $${sym}`, url: buyUrl }, ...(sym === "BLAST" ? [] : [{ text: "💥 Buy $BLAST", url: buyDeepLink("BLAST") }])]);
          if (img) {
            const sent = await tg("sendPhoto", { chat_id: chatId, photo: img, caption, parse_mode: "HTML", reply_to_message_id: replyTo, reply_markup: { inline_keyboard: rows } });
            if (sent) return;
          }
          const why = !stats && !pool
            ? "⚠️ Couldn't load token data right now (price sources didn't answer). Tap 🔄 Retry in a moment."
            : stats?.onCurve && list.length < 3 ? "ℹ️ Still on the bonding curve and no curve candles yet (too few trades). Tap 🔄 Retry later or use the chart links above."
            : !pool && list.length < 3 ? "ℹ️ No DEX pool found for this token yet, so there are no candles."
            : list.length < 3 ? "⚠️ Candle data didn't load (or too few trades on this timeframe). Tap 🔄 Retry or try another timeframe."
            : "⚠️ The chart image failed to render. Tap 🔄 Retry.";
          rows.unshift([{ text: "🔄 Retry", callback_data: `chr:${tf}` }]);
          await tg("sendMessage", { chat_id: chatId, text: `${caption}\n\n${why}`, parse_mode: "HTML", disable_web_page_preview: true, reply_to_message_id: replyTo, reply_markup: { inline_keyboard: rows } });
        };
        // Button taps: first tap asks, second tap (Confirm) runs. Nothing moves on a single tap.
        const cq = update?.callback_query;
        if (cq?.message) {
          threadId = (cq.message as { message_thread_id?: number }).message_thread_id;
          const chat_id = cq.message.chat.id;
          const message_id = cq.message.message_id;
          const chr = (cq.data ?? "").match(/^chr:(1m|5m|15m|1h|4h|1d)$/);
          if (chr) {
            const m = cq.message as { text?: string; caption?: string };
            const t = findScanTarget(m.caption ?? m.text ?? "");
            await tg("answerCallbackQuery", { callback_query_id: cq.id, text: t ? `Loading ${chr[1]} chart…` : "Couldn't find the token in this message. Send /chart again." });
            if (t) await sendChart(chat_id, t, chr[1]!, undefined);
            return Response.json({ ok: true });
          }
          if (cq.data === "sc") {
            // Group scan "Buy" tap: open the token card in the tapper's private chat (never trades in the group).
            const t = findScanTarget(cq.message.text ?? "");
            if (!t) { await tg("answerCallbackQuery", { callback_query_id: cq.id }); return Response.json({ ok: true }); }
            const saved = threadId; threadId = undefined;
            const { getScanStats } = await import("@/lib/tg/scanInfo.server");
            const stats = await getScanStats(t.coinType);
            const sent = await tg("sendMessage", {
              chat_id: cq.from.id, disable_web_page_preview: true, parse_mode: "HTML",
              text: richScanCard(t, stats, "dm"),
              reply_markup: { inline_keyboard: await userDeck(cq.from.id, t.symbol, t.coinType) },
            });
            threadId = saved;
            await tg("answerCallbackQuery", sent ? { callback_query_id: cq.id, text: "Sent to your DM with @" + "ourblastsuibot" } : { callback_query_id: cq.id, url: buyDeepLink(t.symbol) });
            return Response.json({ ok: true });
          }
          const cx = (cq.data ?? "").match(/^cx\|([bs])\|(\d{1,2})$/);
          if (cx || cq.data === "pp") {
            await tg("answerCallbackQuery", { callback_query_id: cq.id });
            const t0 = findScanTarget(cq.message.text ?? "");
            if (!t0) return Response.json({ ok: true });
            const t = { ...t0, symbol: cardSymbol(cq.message.text ?? "", t0.symbol) };
            if (cx) {
              const buy = cx[1] === "b";
              await tg("sendMessage", {
                chat_id,
                text: `${buy ? CUSTOM_BUY_PROMPT : CUSTOM_SELL_PROMPT} $${t.symbol} (max slippage ${cx[2]}%)\n${t.coinType}\n\n${buy ? "Example: 3.5" : "Example: 40 (= 40% of your holding)"}`,
                reply_markup: { force_reply: true, input_field_placeholder: buy ? "SUI amount, e.g. 3.5" : "Percent 1–100" },
              });
              return Response.json({ ok: true });
            }
            const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
            const u = { x_username: await tgWalletHandle(cq.from.id) as string | null };
            if (!u?.x_username) { await tg("sendMessage", { chat_id, text: "🔗 Link your X account first (/link)." }); return Response.json({ ok: true }); }
            await replyWithProgress(chat_id, "Calculating PnL", async () => (await import("@/lib/tg/pnl.server")).tokenPnlReply(u.x_username!, t.coinType, t.symbol));
            return Response.json({ ok: true });
          }
          const deckTap = parseDeckTap(cq.data ?? "");
          if (deckTap) {
            const t = findScanTarget(cq.message.text ?? "");
            if (!t) { await tg("answerCallbackQuery", { callback_query_id: cq.id }); return Response.json({ ok: true }); }
            let override: number[] | undefined;
            let note: string | undefined;
            if (deckTap.kind === "wallet") {
              const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
              const u = { x_username: await tgWalletHandle(cq.from.id) as string | null };
              if (!u?.x_username) note = "Link your X account first (/link).";
              else {
                const { listTgWallets, setTradeSlots } = await import("@/lib/tg/tgWallets.server");
                const cur = await listTgWallets(cq.from.id, u.x_username);
                const r = await setTradeSlots(cq.from.id, u.x_username, toggleSlot(cur.selected, deckTap.slot));
                override = r.ok ? r.selected : undefined;
                note = r.ok ? `Trading from ${r.selected.map((x) => `W${x}`).join(", ")}` : r.error;
              }
            } else note = `Slippage ${deckTap.slip}%`;
            await tg("answerCallbackQuery", { callback_query_id: cq.id, text: note });
            const { getScanStats } = await import("@/lib/tg/scanInfo.server");
            const stats = await getScanStats(t.coinType).catch(() => null);
            const kb = await userDeck(cq.from.id, t.symbol, t.coinType, deckTap.slip, override);
            const edited = stats ? await tg("editMessageText", { chat_id, message_id, text: richScanCard(t, stats, "dm"), disable_web_page_preview: true, parse_mode: "HTML", reply_markup: { inline_keyboard: kb } }) : null;
            if (!edited) await tg("editMessageReplyMarkup", { chat_id, message_id, reply_markup: { inline_keyboard: kb } });
            return Response.json({ ok: true });
          }
          if (cq.data?.startsWith("m:")) {
            await tg("answerCallbackQuery", { callback_query_id: cq.id });
            const key = cq.data.slice(2);
            const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
            const u = { x_username: await tgWalletHandle(cq.from.id) as string | null };
            const h = u?.x_username ?? null;
            if (key === "home") {
              // tg-<id> is a native Telegram wallet, not a linked X account: show the Link X row instead.
              const xh = h && !h.startsWith("tg-") ? h : null;
              await tg("sendMessage", { chat_id, text: dashboardText(xh), reply_markup: { inline_keyboard: dashboardKeyboard(xh) } });
              return Response.json({ ok: true });
            }
            if (key === "balance" || key === "wallet" || key === "positions") {
              if (!h) {
                await tg("sendMessage", { chat_id, text: "🔗 Link your X account first.", reply_markup: { inline_keyboard: [[{ text: "🔗 Link X account", web_app: { url: LINK_URL } }]] } });
                return Response.json({ ok: true });
              }
              await replyWithProgress(chat_id, key === "wallet" ? "Loading addresses" : "Reading balances", async () => {
                const [srv, fmt] = await Promise.all([import("@/lib/tg/walletChat.server"), import("@/lib/tg/walletChat")]);
                const snap = await srv.walletSnapshot(h, { sui: key !== "wallet", other: key === "balance" });
                return key === "wallet" ? fmt.formatWallet(snap) : key === "positions" ? (await import("@/lib/tg/pnl.server")).positionsPnl(h).catch(() => fmt.formatPositions(snap)) : fmt.formatBalance(snap);
              }, key === "positions" ? HOLDINGS_KB : undefined);
              return Response.json({ ok: true });
            }
            if (key === "wallets" && h) {
              const p = await walletPicker(cq.from.id, h);
              await tg("sendMessage", { chat_id, text: p.text, disable_web_page_preview: true, reply_markup: { inline_keyboard: p.kb } });
              return Response.json({ ok: true });
            }
            if (key === "bridges" && h) {
              await replyWithProgress(chat_id, "Loading bridges", async () => {
                const b = await import("@/lib/tg/bridgeHistory.server");
                return b.formatBridgeHistory(await b.bridgeHistory(h));
              });
              return Response.json({ ok: true });
            }
            if ((key === "wallets" || key === "orders") && h) {
              await replyWithProgress(chat_id, "Loading", async () => {
                const { runTgCommand } = await import("@/lib/tg/runCommand.server");
                return (await runTgCommand(cq.from.id, key, h)).reply;
              });
              return Response.json({ ok: true });
            }
            if (key === "bridge") {
              const m = bridgeStep("home");
              await tg("sendMessage", { chat_id, text: m.text, reply_markup: { inline_keyboard: m.kb } });
              return Response.json({ ok: true });
            }
            if (key === "snipe") {
              await tg("sendMessage", { chat_id, text: SNIPE_MENU_TEXT, disable_web_page_preview: true, reply_markup: { inline_keyboard: snipeMenuKeyboard() } });
              return Response.json({ ok: true });
            }
            const how = MENU_HOWTO[key];
            if (how) await tg("sendMessage", { chat_id, text: how, disable_web_page_preview: true, reply_markup: { inline_keyboard: [[{ text: "⬅️ Menu", callback_data: "m:home" }]] } });
            return Response.json({ ok: true });
          }
          if (cq.data?.startsWith("br:")) {
            await tg("answerCallbackQuery", { callback_query_id: cq.id });
            const [, kind, code] = cq.data.split(":");
            const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
            const u = { x_username: await tgWalletHandle(cq.from.id) as string | null };
            const h = u?.x_username ?? null;
            if (!h) {
              await tg("sendMessage", { chat_id, text: "🔗 Link your X account first.", reply_markup: { inline_keyboard: [[{ text: "🔗 Link X account", web_app: { url: LINK_URL } }]] } });
              return Response.json({ ok: true });
            }
            if (kind === "t") {
              if (code === "hist") {
                await replyWithProgress(chat_id, "Loading bridges", async () => {
                  const b = await import("@/lib/tg/bridgeHistory.server");
                  return b.formatBridgeHistory(await b.bridgeHistory(h));
                });
                return Response.json({ ok: true });
              }
              if (code === "addr") {
                await replyWithProgress(chat_id, "Loading addresses", async () => {
                  const [srv, fmt] = await Promise.all([import("@/lib/tg/walletChat.server"), import("@/lib/tg/walletChat")]);
                  return fmt.formatWallet(await srv.walletSnapshot(h, { sui: false, other: false }));
                });
                return Response.json({ ok: true });
              }
              const m = bridgeStep(code === "out" ? "out" : code === "in" ? "in" : "home");
              await tg("editMessageText", { chat_id, message_id, text: m.text, reply_markup: { inline_keyboard: m.kb } });
              return Response.json({ ok: true });
            }
            if (kind === "home" || kind === "d" || kind === "c") {
              const m = bridgeStep(kind === "home" ? "home" : code ?? "home");
              await tg("editMessageText", { chat_id, message_id, text: m.text, reply_markup: { inline_keyboard: m.kb } });
              return Response.json({ ok: true });
            }
            if (kind === "r") {
              const b = await import("@/lib/tg/bridgeHistory.server");
              const [latest] = await b.bridgeHistory(h, 1);
              const kb = { inline_keyboard: [[{ text: "🔄 Refresh", callback_data: "br:r" }, { text: "📜 History", callback_data: "br:t:hist" }], [{ text: "🌉 New bridge", callback_data: "br:home" }]] };
              const text = progressCard(latest);
              if (message_id && cq.message?.text?.startsWith("📡")) await tg("editMessageText", { chat_id, message_id, text, disable_web_page_preview: true, reply_markup: kb });
              else await tg("sendMessage", { chat_id, text, disable_web_page_preview: true, reply_markup: kb });
              return Response.json({ ok: true });
            }
            const cmd = BRIDGE_PRESETS[code ?? ""];
            if (!cmd) return Response.json({ ok: true });
            if (kind === "p") {
              await tg("sendMessage", {
                chat_id,
                text: `🌉 Bridge (4/4) — Review\n${cmd}\n\nOnly this amount moves. Tap Confirm to send.`,
                reply_markup: { inline_keyboard: [[{ text: "✅ Confirm bridge", callback_data: `br:x:${code}` }], NAV(`br:c:${chainOf(code ?? "") ?? "s"}`)] },
              });
              return Response.json({ ok: true });
            }
            if (kind === "x") {
              await tg("editMessageReplyMarkup", { chat_id, message_id, reply_markup: { inline_keyboard: [] } });
              await replyWithProgress(chat_id, "Bridging", async () => {
                const { runTgCommand } = await import("@/lib/tg/runCommand.server");
                return (await runTgCommand(cq.from.id, cmd, h)).reply;
              });
              const b = await import("@/lib/tg/bridgeHistory.server");
              const [latest] = await b.bridgeHistory(h, 1).catch(() => []);
              await tg("sendMessage", { chat_id, text: progressCard(latest), disable_web_page_preview: true, reply_markup: { inline_keyboard: [[{ text: "🔄 Refresh", callback_data: "br:r" }, { text: "📜 History", callback_data: "br:t:hist" }]] } });
            }
            return Response.json({ ok: true });
          }
          if (cq.data?.startsWith("ws:")) {
            const k = cq.data.slice(3);
            const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
            const u = { x_username: await tgWalletHandle(cq.from.id) as string | null };
            const h = u?.x_username;
            if (!h) {
              await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Link your X account first." });
              return Response.json({ ok: true });
            }
            if (k === "backup") {
              await tg("answerCallbackQuery", { callback_query_id: cq.id });
              await tg("sendMessage", {
                chat_id,
                text: "🔐 Back up a wallet key\nKeys are never sent in chat — chat history syncs to every device.\n\nOpen the wallet manager, tap Backup on W1–W6, tick the warning, then Reveal. The key shows for 60 seconds, then hides and your clipboard clears.\n\nVault (Turnkey) wallets can't be exported.",
                reply_markup: { inline_keyboard: [[{ text: "🔐 Open secure backup", web_app: { url: LINK_URL } }], [{ text: "⬅️ Wallets", callback_data: "m:wallets" }]] },
              });
              return Response.json({ ok: true });
            }
            if (k === "move" || k === "out" || k === "merge") {
              await tg("answerCallbackQuery", { callback_query_id: cq.id });
              const label = k === "move" ? "🔀 Move between wallets" : k === "out" ? "📤 Withdraw to an outside address" : "🧲 Consolidate into one wallet";
              const how = k === "move"
                ? "Pick the from-wallet, token (SUI, USDC or any token) and amount, then the wallets to send to. Or type: w1 send 5 sui to 0x… (the other wallet's address)."
                : k === "out" ? "Pick the wallet, token, amount and paste a Sui address. Or type: w2 send 10 $BLAST to 0x…"
                : "Pick the wallet to gather into — every other wallet's tokens and SUI move there (0.02 SUI kept in each for fees).";
              await tg("sendMessage", { chat_id, text: `${label}\n${how}\nYou review and confirm before anything moves.`, reply_markup: { inline_keyboard: [[{ text: "Open wallet manager", web_app: { url: LINK_URL } }], [{ text: "⬅️ Wallets", callback_data: "m:wallets" }]] } });
              return Response.json({ ok: true });
            }
            const w = await import("@/lib/tg/tgWallets.server");
            let note = "";
            if (k === "new") {
              const r = await w.createTgWallet(cq.from.id, null);
              note = r.ok ? `W${r.wallet.slot} created` : r.error;
            } else if (k === "all") {
              await w.setTradeSlots(cq.from.id, h, "all"); note = "All wallets trade";
            } else if (/^[1-6]$/.test(k)) {
              const slot = Number(k);
              const { selected } = await w.listTgWallets(cq.from.id, h);
              const next = selected.includes(slot) ? selected.filter((x) => x !== slot) : [...selected, slot].sort();
              if (!next.length) note = "Keep at least one wallet on";
              else { const r = await w.setTradeSlots(cq.from.id, h, next); note = r.ok ? `W${slot} ${selected.includes(slot) ? "off" : "on"}` : (r.error ?? "Couldn't save"); }
            }
            await tg("answerCallbackQuery", { callback_query_id: cq.id, text: note.slice(0, 190) });
            const p = await walletPicker(cq.from.id, h);
            await tg("editMessageText", { chat_id, message_id, text: p.text, disable_web_page_preview: true, reply_markup: { inline_keyboard: p.kb } });
            return Response.json({ ok: true });
          }
          if (cq.data === "lp" || cq.data === "wp") {
            await tg("answerCallbackQuery", { callback_query_id: cq.id, text: cq.data === "lp" ? "Placing…" : "Running…" });
            const lines = (cq.message.text ?? "").split("\n").reverse();
            const line = cq.data === "lp" ? lines.find((l) => l.startsWith("place limit ")) : lines.find((l) => /^w[1-6] /.test(l));
            if (!line) return Response.json({ ok: true });
            await tg("editMessageReplyMarkup", { chat_id, message_id, reply_markup: { inline_keyboard: [] } });
            await replyWithProgress(chat_id, cq.data === "lp" ? "Placing order" : "Running", async () => {
              const { runTgCommand } = await import("@/lib/tg/runCommand.server");
              return (await runTgCommand(cq.from.id, line)).reply;
            });
            return Response.json({ ok: true });
          }
          if (cq.data === "xl" || cq.data?.startsWith("xp|")) {
            await tg("answerCallbackQuery", { callback_query_id: cq.id });
            const h = await tgWalletHandle(cq.from.id);
            if (!h) return Response.json({ ok: true });
            const pnl = await import("@/lib/tg/pnl.server");
            const toks = (await pnl.heldTokens(h).catch(() => [])).slice(0, 12);
            if (cq.data === "xl") {
              const cells: Btn[] = toks.map((t, i) => ({ text: `$${t.symbol}`.slice(0, 20), callback_data: `xp|${i}` }));
              const rows: Btn[][] = [];
              for (let i = 0; i < cells.length; i += 3) rows.push(cells.slice(i, i + 3));
              await tg("sendMessage", { chat_id, text: toks.length ? "🎛 Pick a token to exit:" : "No token positions yet.", reply_markup: { inline_keyboard: [...rows, [{ text: "⬅️ Holdings", callback_data: "m:positions" }]] } });
              return Response.json({ ok: true });
            }
            const t = toks[Number(cq.data.slice(3))];
            if (!t) { await tg("sendMessage", { chat_id, text: "That token isn't in your wallet anymore. Refresh: /holding" }); return Response.json({ ok: true }); }
            const sym = await realSymbol(t.coinType, t.symbol);
            const lines = await pnl.tokenPnlReply(h, t.coinType, sym).catch(() => `📊 $${sym}`);
            await tg("sendMessage", { chat_id, disable_web_page_preview: true, text: `🎛 Exit $${sym}\n${t.coinType}\n\n${lines}\n\nSell buttons run instantly from your selected wallet(s).`, reply_markup: { inline_keyboard: (await import("@/lib/tg/autoSnipe")).snipeExitKeyboard(t.coinType) } });
            return Response.json({ ok: true });
          }
          if (cq.data === "ti" || /^tr\|\d{1,2}$/.test(cq.data ?? "")) {
            const trail = cq.data !== "ti" ? Number(cq.data!.slice(3)) : null;
            await tg("answerCallbackQuery", { callback_query_id: cq.id, text: trail ? "Setting trailing stop…" : "Taking initial…" });
            const ct = (cq.message.text ?? "").split("\n").map((l) => detectToken(l)?.coinType).find(Boolean);
            await replyWithProgress(chat_id, trail ? "Setting trailing stop" : "Taking initial", async () => {
              if (!ct) return "Couldn't find the token in that message. Nothing was done.";
              const h = await tgWalletHandle(cq.from.id);
              if (!h) return "Link your wallet first.";
              const { listTgWallets } = await import("@/lib/tg/tgWallets.server");
              const { selected } = await listTgWallets(cq.from.id, h);
              if (trail) {
                if (![15, 25].includes(trail)) return "Unsupported trail.";
                return (await import("@/lib/tg/limitOrder.server")).placeTrailing(cq.from.id, ct, trail, selected);
              }
              const pv = await (await import("@/lib/tg/pnl.server")).positionValue(h, ct).catch(() => null);
              const { takeInitialPct } = await import("@/lib/tg/limitOrder");
              const pct = pv ? takeInitialPct(pv.costSui, pv.valueSui) : null;
              if (!pv) return "Take initial needs a tracked OurBank buy and a live price. Nothing was sold.";
              if (pct == null) return `Not in profit yet (value ${pv.valueSui.toFixed(3)} SUI vs cost ${pv.costSui.toFixed(3)} SUI). Nothing was sold.`;
              const { runTgCommand } = await import("@/lib/tg/runCommand.server");
              const r = await runTgCommand(cq.from.id, `sell ${pct}% ${ct} slippage 15%`, null, { mainOnly: true });
              return `💰 Take initial: selling ${pct}% to recover ~${pv.costSui.toFixed(3)} SUI cost (main wallet)\n${r.reply}`;
            });
            return Response.json({ ok: true });
          }
          if (cq.data === "pbg" || cq.data?.startsWith("pbg:")) {
            const pc = await import("@/lib/tg/pnlCard");
            const key = cq.data.slice(4);
            if (key && pc.PNL_PRESETS[key]) {
              const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
              await db.from("tg_users").update({ pnl_bg: key }).eq("tg_user_id", cq.from.id);
              await tg("answerCallbackQuery", { callback_query_id: cq.id, text: `Background: ${pc.PNL_PRESETS[key]!.label}` });
              await tg("sendPhoto", { chat_id, photo: pc.PNL_PRESETS[key]!.url, caption: `✅ PnL card background set to ${pc.PNL_PRESETS[key]!.label}` });
            } else {
              await tg("answerCallbackQuery", { callback_query_id: cq.id });
              await tg("sendMessage", { chat_id, text: pc.PNL_BG_HELP, reply_markup: { inline_keyboard: pc.pnlBgKeyboard() } });
            }
            return Response.json({ ok: true });
          }
          if (cq.data === "tsl") {
            await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Setting TP/SL…" });
            const ct = (cq.message.text ?? "").split("\n").map((l) => detectToken(l)?.coinType).find(Boolean);
            await replyWithProgress(chat_id, "Setting TP/SL", async () => {
              if (!ct) return "Couldn't find the token in that message. Nothing was set.";
              const h = await tgWalletHandle(cq.from.id);
              if (!h) return "Link your wallet first.";
              const [{ placeTpSl }, { listTgWallets }, { TPSL_DEFAULT }] = await Promise.all([import("@/lib/tg/limitOrder.server"), import("@/lib/tg/tgWallets.server"), import("@/lib/tg/limitOrder")]);
              const { selected } = await listTgWallets(cq.from.id, h);
              return placeTpSl(cq.from.id, ct, TPSL_DEFAULT.tp, TPSL_DEFAULT.sl, selected);
            });
            return Response.json({ ok: true });
          }
          if (cq.data?.startsWith("sa|") || cq.data === "as" || cq.data === "asl" || cq.data === "asp" || cq.data === "ass") {
            await tg("answerCallbackQuery", { callback_query_id: cq.id, text: cq.data === "as" ? "Turning on…" : undefined });
            const auto = await import("@/lib/tg/autoSnipe");
            const { runTgCommand } = await import("@/lib/tg/runCommand.server");
            if (cq.data === "asp" || cq.data === "ass") {
              const cmd = cq.data === "asp" ? "pausesnipe all" : "stopsnipe all";
              await replyWithProgress(chat_id, "Updating rules", async () => (await runTgCommand(cq.from.id, cmd)).reply, [[{ text: "🎯 Sniper", callback_data: "m:snipe" }, { text: "⬅️ Menu", callback_data: "m:home" }]]);
              return Response.json({ ok: true });
            }
            if (cq.data === "asl") {
              await replyWithProgress(chat_id, "Loading rules", async () => (await runTgCommand(cq.from.id, "autosnipes")).reply);
              return Response.json({ ok: true });
            }
            if (cq.data === "as") {
              const line = (cq.message.text ?? "").split("\n").reverse().find((l) => l.startsWith("autosnipe "));
              const { reply } = line ? await runTgCommand(cq.from.id, `confirm ${line}`) : { reply: "Rule not found. Nothing was turned on." };
              await tg("editMessageText", { chat_id, message_id, text: reply.slice(0, 4000), disable_web_page_preview: true, reply_markup: { inline_keyboard: [[{ text: "📋 My rules", callback_data: "asl" }, { text: "⬅️ Menu", callback_data: "m:home" }]] } });
              return Response.json({ ok: true });
            }
            const [, pads, amt, exit] = cq.data!.split("|");
            const r = auto.parseAutoSnipeCommand(`autosnipe ${pads} ${amt} sui${exit === "t" ? " tp 100% sl 30%" : ""}`);
            if (r?.op !== "start") return Response.json({ ok: true });
            await sendAutoReview(tg, chat_id, cq.from.id, r);
            return Response.json({ ok: true });
          }
          if (cq.data === "cc") {
            await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Starting…" });
            const { parseCopyCommand } = await import("@/lib/tg/copyTrade");
            const line = (cq.message.text ?? "").split("\n").reverse().find((l) => l.startsWith("copy "));
            const c = line ? parseCopyCommand(line) : null;
            if (c?.op !== "start") return Response.json({ ok: true });
            const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
            const u = { x_username: await tgWalletHandle(cq.from.id) as string | null };
            if (!u?.x_username) {
              await tg("sendMessage", { chat_id, text: "🔗 Link your X account first.", reply_markup: { inline_keyboard: [[{ text: "🔗 Link X account", web_app: { url: LINK_URL } }]] } });
              return Response.json({ ok: true });
            }
            const { count } = await db.from("tg_wallet_follows").select("id", { count: "exact", head: true }).eq("tg_user_id", cq.from.id).neq("address", c.address);
            if ((count ?? 0) >= MAX_FOLLOWS) {
              await tg("sendMessage", { chat_id, text: `Limit is ${MAX_FOLLOWS} wallets. Unfollow one first.` });
              return Response.json({ ok: true });
            }
            const { error } = await db.from("tg_wallet_follows").upsert({ tg_user_id: cq.from.id, address: c.address, copy_sui: Number(c.perTrade), copy_daily_cap: Number(c.dailyCap), copy_slippage: Number(c.slippage) }, { onConflict: "tg_user_id,address" });
            await tg("editMessageText", { chat_id, message_id, disable_web_page_preview: true, text: error ? `Couldn't start: ${error.message}` : `🪞 Copying ${c.address}\n${c.perTrade} SUI per buy · max ${c.dailyCap} SUI/day · slippage ${c.slippage}%\nStarts from its next trade. Stop: stopcopy all` });
            return Response.json({ ok: true });
          }
          const pAct = decodePresaleAction(cq.data ?? "");
          const presaleId = pAct ? presaleIdFromText(cq.message.text ?? "") : null;
          if (pAct) {
            await tg("answerCallbackQuery", { callback_query_id: cq.id, text: pAct.kind === "go" ? "Committing…" : undefined });
            if (!presaleId) return Response.json({ ok: true });
            const card = (cq.message.text ?? "").split("\n\n").slice(0, -1).join("\n\n");
            if (pAct.kind === "ask") {
              await tg("sendMessage", {
                chat_id, text: `${card}\n\nCommit: ${pAct.amount} SUI from your OurBank wallet.\nNothing is sent until you tap Confirm.`, disable_web_page_preview: true,
                reply_markup: { inline_keyboard: [[{ text: "✅ Confirm commit", callback_data: encodePresaleAction("go", pAct.amount) }, { text: "Cancel", callback_data: "x" }]] },
              });
              return Response.json({ ok: true });
            }
            const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
            const data = { x_username: await tgWalletHandle(cq.from.id) as string | null };
            if (!data?.x_username) {
              await tg("sendMessage", { chat_id, text: "🔗 Link your X account first.", reply_markup: { inline_keyboard: [[{ text: "🔗 Link X account", web_app: { url: LINK_URL } }]] } });
              return Response.json({ ok: true });
            }
            await tg("editMessageText", { chat_id, message_id, text: `⏳ Committing ${pAct.amount} SUI…` });
            const { commitPresaleForHandle } = await import("@/lib/tg/presale.server");
            const reply = await commitPresaleForHandle(data.x_username, presaleId, pAct.amount).catch((e) => `Commit failed: ${(e as Error).message}`);
            await tg("sendMessage", { chat_id, text: reply, disable_web_page_preview: true });
            return Response.json({ ok: true });
          }
          const action = decodeAction(cq.data ?? "");
          await tg("answerCallbackQuery", { callback_query_id: cq.id, text: action?.kind === "go" ? "Running…" : undefined });
          if (!action) return Response.json({ ok: true });
          if (action.kind === "cancel") {
            await tg("editMessageReplyMarkup", { chat_id, message_id, reply_markup: { inline_keyboard: [] } });
            await tg("sendMessage", { chat_id, text: "Cancelled. Nothing was sent." });
            return Response.json({ ok: true });
          }
          // Telegram returns the bot-authored message on each tap. Keep the full
          // contract in that message, not callback_data (limited to 64 bytes).
          const coinType = actionCoinType(cq.message.text ?? "", action.symbol);
          const slipNote = action.slippage ? ` (max slippage ${action.slippage}%)` : "";
          const shown = await realSymbol(coinType, action.symbol);
          const what = (action.side === "buy" ? `Spend ${action.amount} SUI on $${shown}` : `Sell ${action.amount}% of your $${shown} for SUI`) + slipNote;
          if (action.kind === "ask") {
            await tg("sendMessage", {
              chat_id,
              text: `Confirm: ${what} from your selected OurBank wallet(s) (/wallets)?${coinType ? `\n${coinType}` : ""}\nBest route is picked when it runs; the receipt shows the final amount.`,
              reply_markup: { inline_keyboard: [[{ text: "✅ Confirm", callback_data: encodeAction({ ...action, kind: "go" }) }, { text: "Cancel", callback_data: "x" }]] },
            });
            return Response.json({ ok: true });
          }
          await tg("editMessageText", { chat_id, message_id, text: `⏳ ${what}…` });
          const { runTgCommand } = await import("@/lib/tg/runCommand.server");
          const isSnipe = (cq.message.text ?? "").startsWith("🎯 Snipe review");
          const command = isSnipe && coinType ? `snipe ${coinType} ${action.amount} sui slippage ${action.slippage ?? "10"}%` : actionCommand(action, coinType);
          const { reply } = await runTgCommand(cq.from.id, command).catch((e) => ({ reply: `❌ Failed: ${(e as Error).message}. Status is unconfirmed. Check your wallet and history before retrying; a transfer may already have been submitted.` }));
          await tg("editMessageText", { chat_id, message_id, text: reply.slice(0, 4000), disable_web_page_preview: true, ...(isSnipe && coinType && /suiscan|suivision|tx\//i.test(reply) ? { text: `${reply}\n${coinType}`.slice(0, 4000), reply_markup: { inline_keyboard: (await import("@/lib/tg/autoSnipe")).snipeExitKeyboard(coinType) } } : {}) });
          if (action.side === "sell" && coinType && reply.includes("✅")) {
            try {
              const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
              const u = { x_username: await tgWalletHandle(cq.from.id) as string | null };
              const card = u?.x_username ? await (await import("@/lib/tg/pnl.server")).exitCardFor(u.x_username, coinType, shown) : null;
              if (card) {
                const { resolvePnlBg } = await import("@/lib/tg/pnlCard");
                const { data: pref } = await db.from("tg_users").select("pnl_bg").eq("tg_user_id", cq.from.id).maybeSingle();
                const reply_markup = { inline_keyboard: [[
                  { text: "Share on X", url: `https://x.com/intent/post?text=${encodeURIComponent(card)}` },
                  { text: "Share on Telegram", url: `https://t.me/share/url?url=${encodeURIComponent("https://t.me/ourblastsuibot")}&text=${encodeURIComponent(card)}` },
                ], [{ text: "🎨 Change background", callback_data: "pbg" }]] };
                const sent = await tg("sendPhoto", { chat_id, photo: resolvePnlBg((pref as { pnl_bg?: string | null } | null)?.pnl_bg), caption: card, reply_markup });
                if (!sent) await tg("sendMessage", { chat_id, text: card, disable_web_page_preview: true, reply_markup });
              }
            } catch { /* PnL card is best-effort; the trade receipt already went out */ }
          }
          return Response.json({ ok: true });
        }

        const msg = update?.message;
        const chatId = msg?.chat?.id;
        threadId = (msg as { message_thread_id?: number } | undefined)?.message_thread_id;
        let original = (msg?.text ?? "").trim();
        // Menu commands map to plain chat commands.
        const slash = original.match(/^\/(balance|wallet|positions|holdings?)(?:@\w+)?\s*$/i);
        if (slash) original = slash[1]!.toLowerCase().replace(/^holdings?$/, "positions");
        const text = original.toLowerCase();
        if (!chatId || !original) return Response.json({ ok: true });

        const isPrivate = msg?.chat?.type === "private" && !!msg.from?.id;
        // Private /buy /sell /send /burn … run as plain commands; bare ones get syntax help.
        if (isPrivate && /^\/snipe(?:@\w+)?\s*$/i.test(original)) {
          await tg("sendMessage", { chat_id: chatId, text: SNIPE_MENU_TEXT, disable_web_page_preview: true, reply_markup: { inline_keyboard: snipeMenuKeyboard() } });
          return Response.json({ ok: true });
        }
        if (isPrivate) {
          const { mapPrivateSlash } = await import("@/lib/tg/slashCommands");
          const ps = mapPrivateSlash(original);
          if (ps && "help" in ps) {
            await tg("sendMessage", { chat_id: chatId, text: ps.help });
            return Response.json({ ok: true });
          }
          if (ps) original = ps.text;
        }
        // Looked up once per message, then reused by every branch below.
        let handleLookup: Promise<string | null> | null = null;
        const linkedHandle = (): Promise<string | null> => {
          if (!msg?.from?.id) return Promise.resolve(null);
          const uid = msg.from.id;
          handleLookup ??= (async () => {
            const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
            const data = { x_username: await tgWalletHandle(uid) as string | null };
            return data?.x_username ?? null;
          })();
          return handleLookup;
        };
        const linkKb = { inline_keyboard: [[{ text: "🔗 Link X account", web_app: { url: LINK_URL } }]] };

        const pbgCmd = isPrivate ? (await import("@/lib/tg/pnlCard")).parsePnlBg(original) : null;
        if (pbgCmd) {
          const pc = await import("@/lib/tg/pnlCard");
          if ("menu" in pbgCmd) {
            await tg("sendMessage", { chat_id: chatId, text: pc.PNL_BG_HELP, reply_markup: { inline_keyboard: pc.pnlBgKeyboard() } });
          } else {
            const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
            const v = "reset" in pbgCmd ? null : pbgCmd.set;
            await db.from("tg_users").update({ pnl_bg: v }).eq("tg_user_id", msg!.from!.id);
            const sent = await tg("sendPhoto", { chat_id: chatId, photo: pc.resolvePnlBg(v), caption: "✅ PnL card background saved. It shows on your next exit card." });
            if (!sent) await tg("sendMessage", { chat_id: chatId, text: "⚠️ Saved, but Telegram couldn't load that picture. Use a direct https image link (.jpg/.png), or pick a preset: /pnlbg" });
          }
          return Response.json({ ok: true });
        }
        if (/^\/(link|account|me)\b/.test(text) && isPrivate) {
          const raw = await linkedHandle();
          const h = raw && !raw.startsWith("tg-") ? raw : null;
          await tg("sendMessage", {
            chat_id: chatId,
            text: h
              ? `✅ Linked to X @${h}. Trades in this chat use that account's OurBank wallet.\nTo switch accounts, open the app → Wallet → Unlink.`
              : "✅ You already have a Telegram OurBank wallet — trade, send and receive tips without X.\n\n🔗 Optional: bind your X account to use the same wallet on X and the website. Your Telegram wallet stays available as an extra wallet (see /wallets).",
            reply_markup: h ? { inline_keyboard: [[{ text: "Open wallet", web_app: { url: LINK_URL } }]] } : linkKb,
          });
          return Response.json({ ok: true });
        }

        const startCt = isPrivate ? parseStartContract(original) : null;
        const startBuyRaw = isPrivate && !startCt ? parseStartBuy(original) : null;
        const startHit = startBuyRaw ? detectToken(`$${startBuyRaw}`) : null;
        const deepT = startCt ? { symbol: startCt.split("::")[2]!.toUpperCase().slice(0, 16), coinType: startCt }
          : startHit?.coinType ? { symbol: startBuyRaw!, coinType: startHit.coinType } : null;
        if (deepT) {
          const { getScanStats } = await import("@/lib/tg/scanInfo.server");
          const stats = await getScanStats(deepT.coinType);
          await tg("sendMessage", {
            chat_id: chatId, disable_web_page_preview: true, parse_mode: "HTML",
            text: richScanCard(deepT, stats, "dm"),
            reply_markup: { inline_keyboard: await userDeck(msg!.from!.id, deepT.symbol, deepT.coinType) },
          });
          return Response.json({ ok: true });
        }
        const startBuy = startBuyRaw;
        if (startBuy) {
          const hit = detectToken(`$${startBuy}`);
          await tg("sendMessage", {
            chat_id: chatId, disable_web_page_preview: true,
            text: `💥 $${startBuy}${hit?.coinType ? `\n${hit.coinType}` : "\nPaste the full contract (0x…::coin::COIN) to get buy buttons."}\n\nPick an amount — you'll confirm before anything moves.`,
            reply_markup: { inline_keyboard: hit?.coinType ? tokenKeyboard(startBuy) : [[{ text: "Open OURBLAST", web_app: { url: APP_URL } }]] },
          });
          return Response.json({ ok: true });
        }
        // /chart <ca|$TICKER> [tf] — candlestick image, groups and DMs, read-only.
        {
          const { parseChartCmd } = await import("@/lib/tg/chart");
          const cc = parseChartCmd(original);
          if (cc) {
            const reply = (t: string) => tg("sendMessage", { chat_id: chatId, text: t, disable_web_page_preview: true, reply_to_message_id: msg?.message_id });
            let t = cc.target ? findScanTarget(`/scan ${cc.target}`) : null;
            if (!t && cc.target) {
              const tk = cc.target.replace(/^\$/, "");
              if (/^[a-z0-9]{1,16}$/i.test(tk)) {
                const { resolveLaunchedTicker } = await import("@/lib/tg/scanInfo.server");
                const ct = await resolveLaunchedTicker(tk).catch(() => null);
                if (ct) t = { symbol: tk.toUpperCase(), coinType: ct };
              }
            }
            if (!t) { await reply("Usage: /chart 0x…::coin::COIN [1m|5m|15m|1h|4h|1d] or /chart $TICKER 1h"); return Response.json({ ok: true }); }
            await sendChart(chatId, t, cc.tf, msg?.message_id);
            return Response.json({ ok: true });
          }
        }
        // Groups: read-only scanner. /scan <ca|$TICKER> or any pasted contract → price card + Buy (opens DM).
        if (!isPrivate) {
          // Group send: only the tagging sender's own OurBank wallet moves; executes immediately (user choice).
          const { parseGroupSend } = await import("@/lib/tg/groupSend");
          const gs = msg?.from?.id ? parseGroupSend(original) : null;
          if (gs) {
            const reply = (t: string) => tg("sendMessage", { chat_id: chatId, text: t, disable_web_page_preview: true, reply_to_message_id: msg?.message_id });
            const sender = await linkedHandle();
            if (!sender) { await reply("🔗 DM @ourblastsuibot once to activate your wallet."); return Response.json({ ok: true }); }
            const replied = (msg as { reply_to_message?: { from?: { id?: number; is_bot?: boolean; username?: string } } }).reply_to_message?.from;
            const label = gs.address
              ? (gs.address.startsWith("0x") ? `${gs.address.slice(0, 6)}…${gs.address.slice(-4)}` : gs.address)
              : `@${gs.tgUsername ?? replied?.username ?? "recipient"}`;
            if (!gs.address && !gs.tgUsername && !replied?.id) { await reply("Tag someone: @ourblastsuibot send @user 100 BLAST — or send 1 BLAST to name.sui / 0x… — or reply to their message."); return Response.json({ ok: true }); }
            const { tgRecipientAddress, tgWalletHandle } = await import("@/lib/tg/tgIdentity.server");
            const { ensureBankWallet } = await import("@/lib/terminal/bank-wallet.server");
            // .sui names / 0x addresses go straight to the shared send handler, which resolves SuiNS on-chain.
            const recAddr = gs.address
              ? gs.address
              : gs.tgUsername
              ? await tgRecipientAddress(gs.tgUsername)
              : replied?.id && !replied.is_bot ? (await ensureBankWallet(await tgWalletHandle(replied.id), null)).address : null;
            if (!recAddr) { await reply(`${label} couldn't be resolved uniquely on Telegram. Ask them to open @ourblastsuibot once (no X needed), then try again. Nothing was sent.`); return Response.json({ ok: true }); }
            const uid = msg!.from!.id;
            await replyWithProgress(chatId, `Sending ${gs.amount} ${gs.token} to ${label}`, async () => {
              const { runTgCommand } = await import("@/lib/tg/runCommand.server");
              const tok = gs.token.startsWith("0x") ? gs.token : `$${gs.token}`;
              return (await runTgCommand(uid, `send ${gs.amount} ${tok} to ${recAddr}`, sender, { mainOnly: true })).reply;
            });
            return Response.json({ ok: true });
          }
          // Group /buy and /burn: the sender's own OurBank wallet only; executes immediately like sends.
          const { parseGroupTrade, parseGroupBuyGift } = await import("@/lib/tg/groupTrade");
          // Buy & gift: "@bot buy 1 sui of <token> to @user" — buy with the sender's wallet, deliver to the recipient's OurBank.
          const gift = msg?.from?.id ? parseGroupBuyGift(original) : null;
          if (gift) {
            const reply = (t: string) => tg("sendMessage", { chat_id: chatId, text: t, disable_web_page_preview: true, reply_to_message_id: msg?.message_id });
            const sender = await linkedHandle();
            if (!sender) { await reply("🔗 DM @ourblastsuibot once to activate your wallet."); return Response.json({ ok: true }); }
            const { tgRecipientAddress } = await import("@/lib/tg/tgIdentity.server");
            const recAddr = await tgRecipientAddress(gift.tgUsername);
            if (!recAddr) { await reply(`@${gift.tgUsername} couldn't be resolved uniquely on Telegram. Ask them to open @ourblastsuibot once (no X needed), then try again. Nothing was traded or sent.`); return Response.json({ ok: true }); }
            const uid = msg!.from!.id;
            await replyWithProgress(chatId, `Buying ${gift.amount} SUI of ${gift.token.startsWith("0x") ? "token" : gift.token} for @${gift.tgUsername} 🎁`, async () => {
              const { runTgCommand } = await import("@/lib/tg/runCommand.server");
              return (await runTgCommand(uid, `buy ${gift.amount} sui of ${gift.token} then send it to ${recAddr}`, sender, { mainOnly: true })).reply;
            });
            return Response.json({ ok: true });
          }
          const gt = msg?.from?.id ? parseGroupTrade(original) : null;
          if (gt) {
            const sender = await linkedHandle();
            if (!sender) {
              await tg("sendMessage", { chat_id: chatId, text: "🔗 DM @ourblastsuibot once to activate your wallet.", reply_to_message_id: msg?.message_id });
              return Response.json({ ok: true });
            }
            const uid = msg!.from!.id;
            await replyWithProgress(chatId, gt.startsWith("send") ? "Burning 🔥" : "Buying", async () => {
              const { runTgCommand } = await import("@/lib/tg/runCommand.server");
              return (await runTgCommand(uid, gt, sender, { mainOnly: true })).reply;
            });
            return Response.json({ ok: true });
          }
          let t = findScanTarget(original);
          if (!t) {
            // "/scan $HOLMOT" for tokens OURBLAST launched (not in the main-token list).
            const tk = original.trim().match(/^\/scan(?:@\w+)?\s+\$?([a-z0-9]{1,16})\s*$/i)?.[1];
            if (tk) {
              const { resolveLaunchedTicker } = await import("@/lib/tg/scanInfo.server");
              const ct = await resolveLaunchedTicker(tk).catch(() => null);
              if (ct) t = { symbol: tk.toUpperCase(), coinType: ct };
            }
          }
          if (t) {
            const { getScanStats } = await import("@/lib/tg/scanInfo.server");
            const stats = await getScanStats(t.coinType);
            if (stats.symbol) t = { ...t, symbol: stats.symbol.toUpperCase().slice(0, 16) };
            const sym = t.symbol;
            await tg("sendMessage", {
              chat_id: chatId, disable_web_page_preview: true, parse_mode: "HTML", reply_to_message_id: msg?.message_id,
              text: richScanCard(t, stats, "group"),
              reply_markup: { inline_keyboard: [(() => {
                // URL button opens the DM directly; tickers or encodable contracts fit Telegram's 64-char start payload.
                const url = mainToken(sym)?.coinType === t.coinType ? buyDeepLink(sym) : contractDeepLink(t.coinType);
                const main = url ? { text: `🟢 Buy $${sym}`, url } : { text: `🟢 Buy $${sym}`, callback_data: "sc" };
                return sym === "BLAST" ? [main] : [main, { text: "💥 Buy $BLAST", url: buyDeepLink("BLAST") }];
              })()] },
            });
            return Response.json({ ok: true });
          }
          if (/^\/scan\b/i.test(text)) {
            await tg("sendMessage", { chat_id: chatId, text: "Usage: /scan 0x…::coin::COIN or /scan $TICKER" });
            return Response.json({ ok: true });
          }
        }
        if (/^\/(start|app|menu|launches|help)/.test(text)) {
          const isHelp = text.startsWith("/help");
          // tg-<id> is a native Telegram wallet, not a linked X account: never show it as an X link.
          const rawHandle = isPrivate ? await linkedHandle() : null;
          const h = rawHandle && !rawHandle.startsWith("tg-") ? rawHandle : null;
          const status = isPrivate ? (h ? `\n\n✅ Linked to X @${h}` : "\n\n✅ Telegram wallet active & ready to trade. Linking X is optional.") : "";
          await tg("sendMessage", {
            chat_id: chatId,
            text: isHelp
              ? "📖 OURBLAST menu\n\nIn this chat:\n• /menu — tap-to-use dashboard\n• /link — bind or check your X account\n• follow 0x… name — dev-wallet alerts · /following · unfollow 0x…\n• copy 0x… 2 sui max 10 sui — copy a wallet's buys/sells with a daily cap · stopcopy all\n• Paste a token address or $TICKER → buy/sell buttons\n• snipe 0x…::coin::COIN 5 sui slippage 10% — review, then confirm\n• autosnipe all 2 sui max 10 sui — snipe all new launches by filter · autosnipes · stopsnipe all\n• limit buy 5 sui of 0x…::coin::COIN at 0.0012 · limit sell 50% 0x… at 0.002 · /orders · cancel all\n• /wallets · newwallet name · use 1,2 · use all · w2 sell 50% 0x… — multiple Sui wallets\n• presales · presale 0x… · commit 5 sui to 0x… — Blast.fun presale buys, confirm first\n• Type any command: balance · wallet · buy 1 sui of $BLAST · sell 50% $BLAST · bridge 0.05 sol to sui · send 10 $BLAST to name.sui\nBuys and sells always ask you to confirm first.\n\nIn the app:\n🏠 Home · 🔍 Discover · ⚡ Trade · 👛 Wallet" + status
              : isPrivate ? dashboardText(h) : "gm 💥 Trade Sui tokens from your OurBank wallet — DM me to start.",
            reply_markup: { inline_keyboard: isPrivate && !isHelp ? dashboardKeyboard(h) : [
              ...(isPrivate && !h ? [[{ text: "🔗 Link X account", web_app: { url: LINK_URL } }]] : []),
              [{ text: "Open OURBLAST", web_app: { url: APP_URL } }],
            ] },
          });
          return Response.json({ ok: true });
        }
        // Trading in chat is private-only so group messages never touch anyone's wallet.
        if (!isPrivate || !msg?.from?.id || (original.startsWith("/") && !/^\/(follow|unfollow|following|copy|stopcopy|wallets|orders|newwallet|bridges|history)\b/i.test(original))) return Response.json({ ok: true });
        // Every wallet action requires a bound X account; show the link button instead of a dead end.
        if (!(await linkedHandle())) {
          await tg("sendMessage", { chat_id: chatId, text: "🔗 Link your X account first — trades use your OurBank wallet tied to X.", reply_markup: linkKb });
          return Response.json({ ok: true });
        }
        // Custom amount typed in reply to the deck's "✏️ Buy X / Sell X%" prompt → same confirm-first card.
        const promptText = (msg as { reply_to_message?: { text?: string; from?: { is_bot?: boolean } } }).reply_to_message;
        if (promptText?.from?.is_bot && promptText.text && (promptText.text.startsWith(CUSTOM_BUY_PROMPT) || promptText.text.startsWith(CUSTOM_SELL_PROMPT))) {
          const buy = promptText.text.startsWith(CUSTOM_BUY_PROMPT);
          const t0 = findScanTarget(promptText.text);
          const t = t0 ? { ...t0, symbol: cardSymbol(promptText.text, t0.symbol) } : null;
          const slip = promptText.text.match(/max slippage (\d{1,2})%/)?.[1];
          const amt = original.replace(/[%\s]|sui/gi, "").replace(",", ".");
          const n = Number(amt);
          if (!t || !/^\d*\.?\d+$/.test(amt) || n <= 0 || (!buy && n > 100) || (buy && n > 10000)) {
            await tg("sendMessage", { chat_id: chatId, text: buy ? "Send a SUI amount like 3.5 — tap ✏️ Buy X SUI again." : "Send a percent from 1 to 100 — tap ✏️ Sell X% again." });
            return Response.json({ ok: true });
          }
          const action = { kind: "ask" as const, side: (buy ? "buy" : "sell") as "buy" | "sell", amount: String(n), symbol: t.symbol, ...(slip ? { slippage: slip } : {}) };
          const go = encodeAction({ ...action, kind: "go" });
          if (!decodeAction(go)) { await tg("sendMessage", { chat_id: chatId, text: "That amount can't be used. Try a simpler number." }); return Response.json({ ok: true }); }
          const what = (buy ? `Spend ${n} SUI on $${t.symbol}` : `Sell ${n}% of your $${t.symbol} for SUI`) + (slip ? ` (max slippage ${slip}%)` : "");
          await tg("sendMessage", {
            chat_id: chatId,
            text: `Confirm: ${what} from your selected OurBank wallet(s) (/wallets)?\n${t.coinType}\nBest route is picked when it runs; the receipt shows the final amount.`,
            reply_markup: { inline_keyboard: [[{ text: "✅ Confirm", callback_data: go }, { text: "Cancel", callback_data: "x" }]] },
          });
          return Response.json({ ok: true });
        }
        if (/^\/?retry\s*(sui\s+)?hop$/i.test(original.trim())) {
          await replyWithProgress(chatId, "Retrying SOL → SUI hop", async () => {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: w } = await supabaseAdmin.from("bank_wallets").select("user_id").ilike("x_username", (await linkedHandle())!).maybeSingle();
            if (!w?.user_id) return "Sign in with X at ourblast.xyz/terminal once to activate bridging.";
            const { retryBnbSolHopsForUser } = await import("@/lib/terminal/evm-sweep.server");
            return retryBnbSolHopsForUser(w.user_id);
          });
          return Response.json({ ok: true });
        }
        if (/^\/?(bridges|bridge history|history)(@\w+)?$/i.test(original.trim())) {
          await replyWithProgress(chatId, "Loading bridges", async () => {
            const b = await import("@/lib/tg/bridgeHistory.server");
            return b.formatBridgeHistory(await b.bridgeHistory((await linkedHandle())!));
          });
          return Response.json({ ok: true });
        }
        if ((await import("@/lib/tg/txHistory")).isTxCommand(original)) {
          await replyWithProgress(chatId, "Loading transactions", async () => {
            const { walletTransactions } = await import("@/lib/tg/txHistory.server");
            const { formatTxList } = await import("@/lib/tg/txHistory");
            return formatTxList(await walletTransactions(msg.from!.id, (await linkedHandle())!, 8));
          });
          return Response.json({ ok: true });
        }
        if (/^\/?wallets(@\w+)?$/i.test(original.trim())) {
          const p = await walletPicker(msg.from.id, (await linkedHandle())!);
          await tg("sendMessage", { chat_id: chatId, text: p.text, disable_web_page_preview: true, reply_markup: { inline_keyboard: p.kb } });
          return Response.json({ ok: true });
        }

        // Wallet views — each command answers a different question, read-only.
        const view = text.match(/^(balance|balances|bal|wallet|address|addresses|deposit|positions|pos|portfolio|holding|holdings)$/)?.[1];
        if (view) {
          const kind = /^(wallet|address|addresses|deposit)$/.test(view) ? "wallet" : /^(positions|pos|portfolio|holding|holdings)$/.test(view) ? "positions" : "balance";
          await replyWithProgress(chatId, kind === "wallet" ? "Loading addresses" : "Reading balances", async () => {
            const [h, srv, fmt] = await Promise.all([linkedHandle(), import("@/lib/tg/walletChat.server"), import("@/lib/tg/walletChat")]);
            const snap = await srv.walletSnapshot(h!, { sui: kind !== "wallet", other: kind === "balance" });
            return kind === "wallet" ? fmt.formatWallet(snap) : kind === "positions" ? (await import("@/lib/tg/pnl.server")).positionsPnl(h!).catch(() => fmt.formatPositions(snap)) : fmt.formatBalance(snap);
          }, kind === "positions" ? HOLDINGS_KB : undefined);
          return Response.json({ ok: true });
        }

        // Copy trading: opt-in per wallet, capped, confirm-first to turn on, one command to stop.
        const { parseCopyCommand, copyLine } = await import("@/lib/tg/copyTrade");
        const cc = parseCopyCommand(original);
        if (cc) {
          const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
          if (cc.op === "error") await tg("sendMessage", { chat_id: chatId, text: cc.error });
          else if (cc.op === "stop") {
            const q = db.from("tg_wallet_follows").update({ copy_sui: null }).eq("tg_user_id", msg.from.id).not("copy_sui", "is", null);
            const { data } = await (cc.address === "all" ? q : q.eq("address", cc.address)).select("id");
            await tg("sendMessage", { chat_id: chatId, text: data?.length ? `🛑 Copy trading stopped for ${data.length} wallet(s). Alerts continue — unfollow to stop them.` : "No active copy trades matched." });
          } else {
            await tg("sendMessage", {
              chat_id: chatId, disable_web_page_preview: true,
              text: `🪞 Copy trade review\nWallet: ${cc.address}\nEach time it buys a token, you buy ${cc.perTrade} SUI of it.\nWhen it sells, you sell all of that token.\nDaily max: ${cc.dailyCap} SUI · slippage ${cc.slippage}%\nTrades run automatically from your OurBank wallet. Stop anytime: stopcopy all\n\n${copyLine(cc)}`,
              reply_markup: { inline_keyboard: [[{ text: "✅ Start copying", callback_data: "cc" }, { text: "Cancel", callback_data: "x" }]] },
            });
          }
          return Response.json({ ok: true });
        }

        // Dev-wallet alerts: follow/unfollow/list. Alert only; nothing is ever traded.
        const fc = parseFollowCommand(original);
        if (fc) {
          const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
          const uid = msg.from.id;
          let out: string;
          if (fc.op === "list") {
            const { data } = await db.from("tg_wallet_follows").select("address, label").eq("tg_user_id", uid).order("created_at");
            out = data?.length ? `👀 Following ${data.length}/${MAX_FOLLOWS}:\n${data.map((d) => `• ${d.label ? `${d.label} — ` : ""}${d.address}`).join("\n")}\n\nStop with: unfollow 0x…` : "You're not following any wallet. Try: follow 0x… devname";
          } else if (fc.op === "unfollow") {
            const { data } = await db.from("tg_wallet_follows").delete().eq("tg_user_id", uid).eq("address", fc.address).select("id");
            out = data?.length ? "🔕 Stopped following that wallet." : "You weren't following that wallet.";
          } else {
            const { count } = await db.from("tg_wallet_follows").select("id", { count: "exact", head: true }).eq("tg_user_id", uid);
            if ((count ?? 0) >= MAX_FOLLOWS) out = `Limit is ${MAX_FOLLOWS} wallets. Unfollow one first.`;
            else {
              const { error } = await db.from("tg_wallet_follows").upsert({ tg_user_id: uid, address: fc.address, label: fc.label ?? null }, { onConflict: "tg_user_id,address" });
              out = error ? `Couldn't save: ${error.message}` : `👀 Following ${fc.label ?? fc.address}.\nYou'll get alerts for its new launches, buys, sells and transfers. Alerts only — nothing is traded for you.`;
            }
          }
          await tg("sendMessage", { chat_id: chatId, text: out, disable_web_page_preview: true });
          return Response.json({ ok: true });
        }

        // Presales: list, view a sale, or review a commit — never commits without Confirm.
        const pre = isPrivate ? parsePresaleCommand(original) : null;
        if (pre) {
          if (pre.kind === "error") {
            await tg("sendMessage", { chat_id: chatId, text: pre.error });
            return Response.json({ ok: true });
          }
          if (pre.kind === "list") {
            const { getBlastPresales } = await import("@/lib/blast/blast.server");
            const feed = await getBlastPresales();
            const live = feed.presales.slice(0, 8);
            const out = !feed.ok
              ? feed.reason === "no_key"
                ? "🚀 Blast.fun presales are coming to this chat soon. For now browse them at https://blast.fun\nAlready have a sale ID? Send: presale 0x…"
                : "Blast.fun presales are unavailable right now. Try again shortly."
              : live.length === 0
                ? "No presales listed right now."
                : "🚀 Blast.fun presales\n\n" + live.map((p) => `$${p.symbol ?? "?"}${p.status ? ` · ${p.status}` : ""}${p.raised || p.target ? ` · ${p.raised ?? "?"}/${p.target ?? "?"} SUI` : ""}\npresale ${p.id}`).join("\n\n") + "\n\nSend a line above to view a sale.";
            await tg("sendMessage", { chat_id: chatId, text: out, disable_web_page_preview: true });
            return Response.json({ ok: true });
          }
          const { loadVerifiedPresale, presaleCard } = await import("@/lib/tg/presale.server");
          const v = await loadVerifiedPresale(pre.id);
          if (!v.ok) {
            await tg("sendMessage", { chat_id: chatId, text: v.error });
            return Response.json({ ok: true });
          }
          const card = presaleCard(v.sale);
          if (pre.kind === "view") {
            await tg("sendMessage", {
              chat_id: chatId, text: `${card}\n\nPick an amount — you'll confirm before anything moves.`, disable_web_page_preview: true,
              reply_markup: { inline_keyboard: [["1", "5", "10"].map((a) => ({ text: `Commit ${a} SUI`, callback_data: encodePresaleAction("ask", a) }))] },
            });
            return Response.json({ ok: true });
          }
          if (!(await linkedHandle())) {
            await tg("sendMessage", { chat_id: chatId, text: "🔗 Link your X account first so the commit uses your OurBank wallet.", reply_markup: linkKb });
            return Response.json({ ok: true });
          }
          await tg("sendMessage", {
            chat_id: chatId, text: `${card}\n\nCommit: ${pre.amount} SUI from your OurBank wallet.\nNothing is sent until you tap Confirm.`, disable_web_page_preview: true,
            reply_markup: { inline_keyboard: [[{ text: "✅ Confirm commit", callback_data: encodePresaleAction("go", pre.amount) }, { text: "Cancel", callback_data: "x" }]] },
          });
          return Response.json({ ok: true });
        }

        // Auto-snipe by filter: review card first; rules only save after Confirm.
        const autoCmd = isPrivate ? (await import("@/lib/tg/autoSnipe")).parseAutoSnipeCommand(original) : null;
        if (autoCmd && msg?.from?.id) {
          if (autoCmd.op === "start") await sendAutoReview(tg, chatId, msg.from.id, autoCmd);
          else {
            const { runTgCommand } = await import("@/lib/tg/runCommand.server");
            const { reply } = await runTgCommand(msg.from.id, original);
            await tg("sendMessage", { chat_id: chatId, text: reply.slice(0, 4000), disable_web_page_preview: true });
          }
          return Response.json({ ok: true });
        }

        // Snipe: contract + SUI amount + slippage cap → always a Confirm card first.
        const snipe = isPrivate ? parseSnipeCommand(original) : null;
        if (snipe) {
          if (!snipe.ok) {
            await tg("sendMessage", { chat_id: chatId, text: snipe.error });
            return Response.json({ ok: true });
          }
          if (!(await linkedHandle())) {
            await tg("sendMessage", { chat_id: chatId, text: "🔗 Link your X account first so the snipe uses your OurBank wallet.", reply_markup: linkKb });
            return Response.json({ ok: true });
          }
          const handle = await linkedHandle();
          if (!handle || !msg?.from?.id) return Response.json({ ok: true });
          const { tradeTargets } = await import("./tgWallets.server");
          const targets = await tradeTargets(msg.from.id, handle);
          const { sniperPreflight } = await import("@/lib/blast/sniper.server");
          const checks = await Promise.all(targets.map(async (t) => ({ slot: t.slot, ...(await sniperPreflight(t.handle, snipe.coinType, snipe.amount, snipe.slippage)) })));
          if (!checks.length || checks.some((c) => !c.ok)) {
            await tg("sendMessage", { chat_id: chatId, text: checks.length ? checks.map((c) => `w${c.slot}\n${c.reply}`).join("\n\n").slice(0, 4000) : "No selected wallet. Open /wallets first." });
            return Response.json({ ok: true });
          }
          const a = { kind: "go" as const, side: "buy" as const, amount: snipe.amount, symbol: snipe.symbol, slippage: snipe.slippage };
          await tg("sendMessage", {
            chat_id: chatId,
            text: `🎯 Snipe review\nToken: $${snipe.symbol}\n${snipe.coinType}\nSpend: ${snipe.amount} SUI per selected wallet\nMax slippage: ${snipe.slippage}%\n${checks.map((c) => `w${c.slot}: ${c.reply}`).join("\n").slice(0, 2600)}\n\nNothing is sent until you tap Confirm.`,
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: [[{ text: "✅ Confirm snipe", callback_data: encodeAction(a) }, { text: "Cancel", callback_data: "x" }]] },
          });
          return Response.json({ ok: true });
        }

        // Limit orders: review card first; the order is only stored after Confirm.
        const { parseLimitCommand, limitLine } = await import("@/lib/tg/limitOrder");
        const lc = parseLimitCommand(original);
        if (lc?.op === "review" || lc?.op === "place") {
          await tg("sendChatAction", { chat_id: chatId, action: "typing" });
          const [{ limitReview }, { listTgWallets }, h] = await Promise.all([import("@/lib/tg/limitOrder.server"), import("@/lib/tg/tgWallets.server"), linkedHandle()]);
          const { selected } = await listTgWallets(msg.from.id, h!);
          await tg("sendMessage", {
            chat_id: chatId, disable_web_page_preview: true,
            text: `${await limitReview(lc, selected.length)}\nNothing is placed until you tap Confirm.\n\n${limitLine(lc)}`,
            reply_markup: { inline_keyboard: [[{ text: "✅ Place order", callback_data: "lp" }, { text: "Cancel", callback_data: "x" }]] },
          });
          return Response.json({ ok: true });
        }
        // One-wallet trades ("w2 sell 50% 0x…") also confirm first.
        const { parseWalletPrefix } = await import("@/lib/tg/multiWallet");
        const wp = parseWalletPrefix(original);
        if (wp) {
          await tg("sendMessage", {
            chat_id: chatId, disable_web_page_preview: true,
            text: `Confirm on wallet w${wp.slot} only:\n${wp.rest}\nNothing is sent until you tap Confirm.\n\nw${wp.slot} ${wp.rest}`,
            reply_markup: { inline_keyboard: [[{ text: "✅ Confirm", callback_data: "wp" }, { text: "Cancel", callback_data: "x" }]] },
          });
          return Response.json({ ok: true });
        }

        const tokenHit = detectToken(original);
        if (tokenHit) {
          const ct = tokenHit.coinType;
          const stats = ct ? await (await import("@/lib/tg/scanInfo.server")).getScanStats(ct).catch(() => null) : null;
          await tg("sendMessage", {
            chat_id: chatId, parse_mode: "HTML", disable_web_page_preview: true,
            text: ct && stats ? richScanCard({ symbol: tokenHit.symbol, coinType: ct }, stats, "dm") : `💥 $${tokenHit.symbol}${ct ? `\n${ct}` : ""}\n\nPick an amount — you'll confirm before anything moves.`,
            reply_markup: { inline_keyboard: ct ? await userDeck(msg!.from!.id, tokenHit.symbol, ct) : tokenKeyboard(tokenHit.symbol) },
          });
          return Response.json({ ok: true });
        }

        // Typed buy/sell gets the same confirm step as buttons; other commands run like the app terminal.
        const trade = original.match(/^buy\s+(\d*\.?\d+)\s+sui\s+(?:of\s+)?(0x[a-f0-9]{1,64}::[a-z_][a-z0-9_]*::[a-z_][a-z0-9_]*|\$?[a-z0-9]{1,16})$/i) ?? null;
        const sell = original.match(/^sell\s+(\d*\.?\d+)%\s+(?:of\s+)?\$?([a-z0-9]{1,16})$/i) ?? null;
        const m = trade ?? sell;
        if (m?.[1] && m[2]) {
          let tokenHit = detectToken(m[2]) ?? detectToken(`$${m[2]}`);
          // "HOLMOT" → a token OURBLAST launched (verified launch record, not a free-text ticker search).
          if (tokenHit && !tokenHit.coinType && !m[2].includes("::")) {
            const launched = await (await import("@/lib/tg/scanInfo.server")).resolveLaunchedTicker(m[2].replace(/^\$/, "")).catch(() => null);
            if (launched) tokenHit = detectToken(launched);
          }
          const side = trade ? "buy" : "sell";
          const a = { kind: "go" as const, side: side as "buy" | "sell", amount: m[1], symbol: tokenHit?.symbol ?? m[2].toUpperCase() };
          const shownSym = await realSymbol(tokenHit?.coinType, a.symbol);
          if (decodeAction(encodeAction(a))) {
            await tg("sendMessage", {
              chat_id: chatId,
              text: `Confirm: ${side === "buy" ? `spend ${a.amount} SUI on $${shownSym}` : `sell ${a.amount}% of your $${shownSym}`}?${tokenHit?.coinType ? `\n${tokenHit.coinType}` : ""}`,
              reply_markup: { inline_keyboard: [[{ text: "✅ Confirm", callback_data: encodeAction(a) }, { text: "Cancel", callback_data: "x" }]] },
            });
            return Response.json({ ok: true });
          }
        }
        const uid = msg.from.id;
        const note = /^(bridge|send|launch|claim|withdraw)\b/i.test(original) ? "Working on it — chain steps can take a moment" : "Checking";
        await replyWithProgress(chatId, note, async () => {
          const [{ runTgCommand }, h] = await Promise.all([import("@/lib/tg/runCommand.server"), linkedHandle()]);
          const { parseGroupTrade } = await import("@/lib/tg/groupTrade");
          return (await runTgCommand(uid, parseGroupTrade(original) ?? original, h)).reply;
        });
        return Response.json({ ok: true });
}

