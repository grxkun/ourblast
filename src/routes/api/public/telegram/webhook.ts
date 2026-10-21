// SPDX-License-Identifier: BUSL-1.1
import { createFileRoute } from "@tanstack/react-router";

import { MAX_FOLLOWS, parseFollowCommand } from "@/lib/tg/walletWatch";
import { actionCoinType, actionCommand, BUY_PRESETS, decodeAction, detectToken, encodeAction, parseSnipeCommand, SELL_PRESETS } from "@/lib/tg/chatTrade";
import { decodePresaleAction, encodePresaleAction, parsePresaleCommand, presaleIdFromText } from "@/lib/tg/presale";

const APP_URL = "https://ourblast.xyz/tg";
const LINK_URL = "https://ourblast.xyz/tg?tab=wallet";

async function webhookSecret(token: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`telegram-webhook:${token}`));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Btn = { text: string; callback_data?: string; web_app?: { url: string }; url?: string };
type Update = {
  message?: { chat?: { id?: number; type?: string }; from?: { id?: number }; text?: string };
  callback_query?: { id: string; data?: string; from: { id: number }; message?: { chat: { id: number }; message_id: number; text?: string } };
};

function tokenKeyboard(symbol: string): Btn[][] {
  return [
    BUY_PRESETS.map((a) => ({ text: `Buy ${a} SUI`, callback_data: encodeAction({ kind: "ask", side: "buy", amount: a, symbol }) })),
    SELL_PRESETS.map((a) => ({ text: a === "100" ? "Sell MAX" : `Sell ${a}%`, callback_data: encodeAction({ kind: "ask", side: "sell", amount: a, symbol }) })),
    [{ text: "Open OURBLAST", web_app: { url: APP_URL } }],
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
    [{ text: "👛 Wallets", callback_data: "m:wallets" }, { text: "📋 Orders", callback_data: "m:orders" }],
    [{ text: "⚡ Open OURBLAST app", web_app: { url: APP_URL } }],
  ];
}

function dashboardText(handle: string | null): string {
  return `💥 OURBLAST dashboard\nTap a button to use it. Anything that spends asks you to confirm first.\n\n${handle ? `✅ Linked to X @${handle}` : "⚠️ X not linked yet — tap Link X account."}`;
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
      [{ text: "⬅️ Menu", callback_data: "m:home" }],
    ],
  };
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


export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["TELEGRAM_BOT_TOKEN"];
        if (!token) return new Response("Not configured", { status: 503 });
        const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (got !== (await webhookSecret(token))) return new Response("Unauthorized", { status: 401 });

        let threadId: number | undefined;
        const tg = async (method: string, body: Record<string, unknown>): Promise<number | undefined> => {
          // Threaded bot chats: reply inside the same topic or Telegram hides it.
          if (threadId && (method === "sendMessage" || method === "sendChatAction")) body = { ...body, message_thread_id: threadId };
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
        const replyWithProgress = async (chat_id: number, note: string, work: () => Promise<string>) => {
          const [pid] = await Promise.all([tg("sendMessage", { chat_id, text: `⏳ ${note}…` }), tg("sendChatAction", { chat_id, action: "typing" })]);
          const started = Date.now();
          const text = await work().catch((e) => `❌ Failed: ${(e as Error).message}. Nothing was sent unless a transaction link is shown.`);
          console.log(`tg command done in ${Date.now() - started}ms`);
          const body = { chat_id, text: text.slice(0, 4000), disable_web_page_preview: true };
          if (pid && (await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, message_id: pid }),
          })).ok) return;
          await tg("sendMessage", body);
        };
        const update = (await request.json().catch(() => null)) as Update | null;

        // Button taps: first tap asks, second tap (Confirm) runs. Nothing moves on a single tap.
        const cq = update?.callback_query;
        if (cq?.message) {
          threadId = (cq.message as { message_thread_id?: number }).message_thread_id;
          const chat_id = cq.message.chat.id;
          const message_id = cq.message.message_id;
          if (cq.data?.startsWith("m:")) {
            await tg("answerCallbackQuery", { callback_query_id: cq.id });
            const key = cq.data.slice(2);
            const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
            const { data: u } = await db.from("tg_users").select("x_username").eq("tg_user_id", cq.from.id).maybeSingle();
            const h = u?.x_username ?? null;
            if (key === "home") {
              await tg("sendMessage", { chat_id, text: dashboardText(h), reply_markup: { inline_keyboard: dashboardKeyboard(h) } });
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
                return key === "wallet" ? fmt.formatWallet(snap) : key === "positions" ? fmt.formatPositions(snap) : fmt.formatBalance(snap);
              });
              return Response.json({ ok: true });
            }
            if (key === "wallets" && h) {
              const p = await walletPicker(cq.from.id, h);
              await tg("sendMessage", { chat_id, text: p.text, disable_web_page_preview: true, reply_markup: { inline_keyboard: p.kb } });
              return Response.json({ ok: true });
            }
            if ((key === "wallets" || key === "orders") && h) {
              await replyWithProgress(chat_id, "Loading", async () => {
                const { runTgCommand } = await import("@/lib/tg/runCommand.server");
                return (await runTgCommand(cq.from.id, key, h)).reply;
              });
              return Response.json({ ok: true });
            }
            const how = MENU_HOWTO[key];
            if (how) await tg("sendMessage", { chat_id, text: how, disable_web_page_preview: true, reply_markup: { inline_keyboard: [[{ text: "⬅️ Menu", callback_data: "m:home" }]] } });
            return Response.json({ ok: true });
          }
          if (cq.data?.startsWith("ws:")) {
            const k = cq.data.slice(3);
            const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
            const { data: u } = await db.from("tg_users").select("x_username").eq("tg_user_id", cq.from.id).maybeSingle();
            const h = u?.x_username;
            if (!h) {
              await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Link your X account first." });
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
          if (cq.data === "cc") {
            await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Starting…" });
            const { parseCopyCommand } = await import("@/lib/tg/copyTrade");
            const line = (cq.message.text ?? "").split("\n").reverse().find((l) => l.startsWith("copy "));
            const c = line ? parseCopyCommand(line) : null;
            if (c?.op !== "start") return Response.json({ ok: true });
            const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
            const { data: u } = await db.from("tg_users").select("x_username").eq("tg_user_id", cq.from.id).maybeSingle();
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
            const { data } = await db.from("tg_users").select("x_username").eq("tg_user_id", cq.from.id).maybeSingle();
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
          const what = (action.side === "buy" ? `Spend ${action.amount} SUI on $${action.symbol}` : `Sell ${action.amount}% of your $${action.symbol} for SUI`) + slipNote;
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
          const { reply } = await runTgCommand(cq.from.id, actionCommand(action, coinType)).catch((e) => ({ reply: `❌ Failed: ${(e as Error).message}. Nothing was sent unless a transaction link is shown.` }));
          await tg("sendMessage", { chat_id, text: reply, disable_web_page_preview: true });
          return Response.json({ ok: true });
        }

        const msg = update?.message;
        const chatId = msg?.chat?.id;
        threadId = (msg as { message_thread_id?: number } | undefined)?.message_thread_id;
        let original = (msg?.text ?? "").trim();
        // Menu commands map to plain chat commands.
        const slash = original.match(/^\/(balance|wallet|positions)(?:@\w+)?\s*$/i);
        if (slash) original = slash[1]!.toLowerCase();
        const text = original.toLowerCase();
        if (!chatId || !original) return Response.json({ ok: true });

        const isPrivate = msg?.chat?.type === "private" && !!msg.from?.id;
        // Looked up once per message, then reused by every branch below.
        let handleLookup: Promise<string | null> | null = null;
        const linkedHandle = (): Promise<string | null> => {
          if (!msg?.from?.id) return Promise.resolve(null);
          const uid = msg.from.id;
          handleLookup ??= (async () => {
            const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
            const { data } = await db.from("tg_users").select("x_username").eq("tg_user_id", uid).maybeSingle();
            return data?.x_username ?? null;
          })();
          return handleLookup;
        };
        const linkKb = { inline_keyboard: [[{ text: "🔗 Link X account", web_app: { url: LINK_URL } }]] };

        if (/^\/(link|account|me)\b/.test(text) && isPrivate) {
          const h = await linkedHandle();
          await tg("sendMessage", {
            chat_id: chatId,
            text: h
              ? `✅ Linked to X @${h}. Trades in this chat use that account's OurBank wallet.\nTo switch accounts, open the app → Wallet → Unlink.`
              : "🔗 Bind your X account to trade here.\n\nTap the button, sign in with X once. Your existing OurBank wallet (same as on X and the website) is then usable right in this chat.",
            reply_markup: h ? { inline_keyboard: [[{ text: "Open wallet", web_app: { url: LINK_URL } }]] } : linkKb,
          });
          return Response.json({ ok: true });
        }

        if (/^\/(start|app|menu|launches|help)/.test(text)) {
          const isHelp = text.startsWith("/help");
          const h = isPrivate ? await linkedHandle() : null;
          const status = isPrivate ? (h ? `\n\n✅ Linked to X @${h}` : "\n\n⚠️ X not linked yet — tap Link X account below.") : "";
          await tg("sendMessage", {
            chat_id: chatId,
            text: isHelp
              ? "📖 OURBLAST menu\n\nIn this chat:\n• /menu — tap-to-use dashboard\n• /link — bind or check your X account\n• follow 0x… name — dev-wallet alerts · /following · unfollow 0x…\n• copy 0x… 2 sui max 10 sui — copy a wallet's buys/sells with a daily cap · stopcopy all\n• Paste a token address or $TICKER → buy/sell buttons\n• snipe 0x…::coin::COIN 5 sui slippage 10% — review, then confirm\n• limit buy 5 sui of 0x…::coin::COIN at 0.0012 · limit sell 50% 0x… at 0.002 · /orders · cancel all\n• /wallets · newwallet name · use 1,2 · use all · w2 sell 50% 0x… — multiple Sui wallets\n• presales · presale 0x… · commit 5 sui to 0x… — Blast.fun presale buys, confirm first\n• Type any command: balance · wallet · buy 1 sui of $BLAST · sell 50% $BLAST · bridge 0.05 sol to sui · send 10 $BLAST to name.sui\nBuys and sells always ask you to confirm first.\n\nIn the app:\n🏠 Home · 🔍 Discover · ⚡ Trade · 👛 Wallet" + status
              : isPrivate ? dashboardText(h) : "gm 💥 Trade Sui tokens from your OurBank wallet — DM me to start.",
            reply_markup: { inline_keyboard: isPrivate && !isHelp ? dashboardKeyboard(h) : [
              ...(isPrivate && !h ? [[{ text: "🔗 Link X account", web_app: { url: LINK_URL } }]] : []),
              [{ text: "Open OURBLAST", web_app: { url: APP_URL } }],
            ] },
          });
          return Response.json({ ok: true });
        }
        // Trading in chat is private-only so group messages never touch anyone's wallet.
        if (!isPrivate || !msg?.from?.id || (original.startsWith("/") && !/^\/(follow|unfollow|following|copy|stopcopy|wallets|orders|newwallet)\b/i.test(original))) return Response.json({ ok: true });
        // Every wallet action requires a bound X account; show the link button instead of a dead end.
        if (!(await linkedHandle())) {
          await tg("sendMessage", { chat_id: chatId, text: "🔗 Link your X account first — trades use your OurBank wallet tied to X.", reply_markup: linkKb });
          return Response.json({ ok: true });
        }
        if (/^\/?wallets(@\w+)?$/i.test(original.trim())) {
          const p = await walletPicker(msg.from.id, (await linkedHandle())!);
          await tg("sendMessage", { chat_id: chatId, text: p.text, disable_web_page_preview: true, reply_markup: { inline_keyboard: p.kb } });
          return Response.json({ ok: true });
        }

        // Wallet views — each command answers a different question, read-only.
        const view = text.match(/^(balance|balances|bal|wallet|address|addresses|deposit|positions|pos|portfolio)$/)?.[1];
        if (view) {
          const kind = /^(wallet|address|addresses|deposit)$/.test(view) ? "wallet" : /^(positions|pos|portfolio)$/.test(view) ? "positions" : "balance";
          await replyWithProgress(chatId, kind === "wallet" ? "Loading addresses" : "Reading balances", async () => {
            const [h, srv, fmt] = await Promise.all([linkedHandle(), import("@/lib/tg/walletChat.server"), import("@/lib/tg/walletChat")]);
            const snap = await srv.walletSnapshot(h!, { sui: kind !== "wallet", other: kind === "balance" });
            return kind === "wallet" ? fmt.formatWallet(snap) : kind === "positions" ? fmt.formatPositions(snap) : fmt.formatBalance(snap);
          });
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
          const a = { kind: "go" as const, side: "buy" as const, amount: snipe.amount, symbol: snipe.symbol, slippage: snipe.slippage };
          await tg("sendMessage", {
            chat_id: chatId,
            text: `🎯 Snipe review\nToken: $${snipe.symbol}\n${snipe.coinType}\nSpend: ${snipe.amount} SUI from your OurBank wallet\nMax slippage: ${snipe.slippage}% — the trade fails on-chain (nothing spent but gas) if the fill is worse.\n\nNothing is sent until you tap Confirm.`,
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
          await tg("sendMessage", {
            chat_id: chatId,
            text: `💥 $${tokenHit.symbol}${tokenHit.coinType ? `\n${tokenHit.coinType}\nhttps://suiscan.xyz/mainnet/coin/${tokenHit.coinType}` : ""}\n\nPick an amount — you'll confirm before anything moves.`,
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: tokenKeyboard(tokenHit.symbol) },
          });
          return Response.json({ ok: true });
        }

        // Typed buy/sell gets the same confirm step as buttons; other commands run like the app terminal.
        const trade = original.match(/^buy\s+(\d*\.?\d+)\s+sui\s+(?:of\s+)?(0x[a-f0-9]{1,64}::[a-z_][a-z0-9_]*::[a-z_][a-z0-9_]*|\$?[a-z0-9]{1,16})$/i) ?? null;
        const sell = original.match(/^sell\s+(\d*\.?\d+)%\s+(?:of\s+)?\$?([a-z0-9]{1,16})$/i) ?? null;
        const m = trade ?? sell;
        if (m?.[1] && m[2]) {
          const tokenHit = detectToken(m[2]) ?? detectToken(`$${m[2]}`);
          const side = trade ? "buy" : "sell";
          const a = { kind: "go" as const, side: side as "buy" | "sell", amount: m[1], symbol: tokenHit?.symbol ?? m[2].toUpperCase() };
          if (decodeAction(encodeAction(a))) {
            await tg("sendMessage", {
              chat_id: chatId,
              text: `Confirm: ${side === "buy" ? `spend ${a.amount} SUI on $${a.symbol}` : `sell ${a.amount}% of your $${a.symbol}`}?${tokenHit?.coinType ? `\n${tokenHit.coinType}` : ""}`,
              reply_markup: { inline_keyboard: [[{ text: "✅ Confirm", callback_data: encodeAction(a) }, { text: "Cancel", callback_data: "x" }]] },
            });
            return Response.json({ ok: true });
          }
        }
        const uid = msg.from.id;
        const note = /^(bridge|send|launch|claim|withdraw)\b/i.test(original) ? "Working on it — chain steps can take a moment" : "Checking";
        await replyWithProgress(chatId, note, async () => {
          const [{ runTgCommand }, h] = await Promise.all([import("@/lib/tg/runCommand.server"), linkedHandle()]);
          return (await runTgCommand(uid, original, h)).reply;
        });
        return Response.json({ ok: true });
      },
    },
  },
});
