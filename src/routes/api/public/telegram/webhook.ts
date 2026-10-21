// SPDX-License-Identifier: BUSL-1.1
import { createFileRoute } from "@tanstack/react-router";

import { actionCoinType, actionCommand, BUY_PRESETS, decodeAction, detectToken, encodeAction, SELL_PRESETS } from "@/lib/tg/chatTrade";

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

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["TELEGRAM_BOT_TOKEN"];
        if (!token) return new Response("Not configured", { status: 503 });
        const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (got !== (await webhookSecret(token))) return new Response("Unauthorized", { status: 401 });

        let threadId: number | undefined;
        const tg = async (method: string, body: Record<string, unknown>) => {
          // Threaded bot chats: reply inside the same topic or Telegram hides it.
          if (threadId && (method === "sendMessage" || method === "sendChatAction")) body = { ...body, message_thread_id: threadId };
          const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
          });
          if (!res.ok) console.error(`Telegram ${method} failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
        };
        const update = (await request.json().catch(() => null)) as Update | null;

        // Button taps: first tap asks, second tap (Confirm) runs. Nothing moves on a single tap.
        const cq = update?.callback_query;
        if (cq?.message) {
          threadId = (cq.message as { message_thread_id?: number }).message_thread_id;
          const chat_id = cq.message.chat.id;
          const message_id = cq.message.message_id;
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
          const what = action.side === "buy" ? `Spend ${action.amount} SUI on $${action.symbol}` : `Sell ${action.amount}% of your $${action.symbol} for SUI`;
          if (action.kind === "ask") {
            await tg("sendMessage", {
              chat_id,
              text: `Confirm: ${what} from your OurBank wallet?${coinType ? `\n${coinType}` : ""}\nBest route is picked when it runs; the receipt shows the final amount.`,
              reply_markup: { inline_keyboard: [[{ text: "✅ Confirm", callback_data: encodeAction({ ...action, kind: "go" }) }, { text: "Cancel", callback_data: "x" }]] },
            });
            return Response.json({ ok: true });
          }
          await tg("editMessageText", { chat_id, message_id, text: `⏳ ${what}…` });
          const { runTgCommand } = await import("@/lib/tg/runCommand.server");
          const { reply } = await runTgCommand(cq.from.id, actionCommand(action, coinType)).catch((e) => ({ reply: `Failed: ${(e as Error).message}` }));
          await tg("sendMessage", { chat_id, text: reply, disable_web_page_preview: true });
          return Response.json({ ok: true });
        }

        const msg = update?.message;
        const chatId = msg?.chat?.id;
        threadId = (msg as { message_thread_id?: number } | undefined)?.message_thread_id;
        let original = (msg?.text ?? "").trim();
        // Menu commands map to plain chat commands.
        const slash = original.match(/^\/(balance|wallet|positions)(?:@\w+)?\s*$/i);
        if (slash) original = slash[1]!.toLowerCase() === "wallet" ? "wallet" : "balance";
        const text = original.toLowerCase();
        if (!chatId || !original) return Response.json({ ok: true });

        const isPrivate = msg?.chat?.type === "private" && !!msg.from?.id;
        const linkedHandle = async (): Promise<string | null> => {
          if (!msg?.from?.id) return null;
          const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
          const { data } = await db.from("tg_users").select("x_username").eq("tg_user_id", msg.from.id).maybeSingle();
          return data?.x_username ?? null;
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

        if (/^\/(start|app|launches|help)/.test(text)) {
          const isHelp = text.startsWith("/help");
          const h = isPrivate ? await linkedHandle() : null;
          const status = isPrivate ? (h ? `\n\n✅ Linked to X @${h}` : "\n\n⚠️ X not linked yet — tap Link X account below.") : "";
          await tg("sendMessage", {
            chat_id: chatId,
            text: (isHelp
              ? "📖 OURBLAST menu\n\nIn this chat:\n• /link — bind or check your X account\n• Paste a token address or $TICKER → buy/sell buttons\n• Type any command: balance · wallet · buy 1 sui of $BLAST · sell 50% $BLAST · bridge 0.05 sol to sui · send 10 $BLAST to name.sui\nBuys and sells always ask you to confirm first.\n\nIn the app:\n🏠 Home · 🔍 Discover · ⚡ Trade · 👛 Wallet"
              : "gm 💥 Trade Sui tokens right here from your OurBank wallet — paste any token address or $TICKER. Send /help for more.") + status,
            reply_markup: { inline_keyboard: [
              ...(isPrivate && !h ? [[{ text: "🔗 Link X account", web_app: { url: LINK_URL } }]] : []),
              [{ text: "Open OURBLAST", web_app: { url: APP_URL } }],
            ] },
          });
          return Response.json({ ok: true });
        }
        // Trading in chat is private-only so group messages never touch anyone's wallet.
        if (!isPrivate || !msg?.from?.id || original.startsWith("/")) return Response.json({ ok: true });
        // Every wallet action requires a bound X account; show the link button instead of a dead end.
        if (!(await linkedHandle())) {
          await tg("sendMessage", { chat_id: chatId, text: "🔗 Link your X account first — trades use your OurBank wallet tied to X.", reply_markup: linkKb });
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
        await tg("sendChatAction", { chat_id: chatId, action: "typing" });
        const { runTgCommand } = await import("@/lib/tg/runCommand.server");
        const { reply } = await runTgCommand(msg.from.id, original).catch((e) => ({ reply: `Failed: ${(e as Error).message}` }));
        await tg("sendMessage", { chat_id: chatId, text: reply, disable_web_page_preview: true });
        return Response.json({ ok: true });
      },
    },
  },
});
