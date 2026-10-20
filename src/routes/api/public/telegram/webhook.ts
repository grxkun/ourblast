// SPDX-License-Identifier: BUSL-1.1
import { createFileRoute } from "@tanstack/react-router";

const APP_URL = "https://ourblast.xyz/tg";

async function webhookSecret(token: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`telegram-webhook:${token}`));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["TELEGRAM_BOT_TOKEN"];
        if (!token) return new Response("Not configured", { status: 503 });
        const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (got !== (await webhookSecret(token))) return new Response("Unauthorized", { status: 401 });

        const update = (await request.json().catch(() => null)) as { message?: { chat?: { id?: number }; text?: string } } | null;
        const chatId = update?.message?.chat?.id;
        const text = (update?.message?.text ?? "").trim().toLowerCase();
        if (!chatId || !/^\/(start|app|launches|help)/.test(text)) return Response.json({ ok: true });
        const isHelp = text.startsWith("/help");

        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: isHelp
              ? "📖 OURBLAST menu\n\n🏠 Home — newest launches\n🔍 Discover — search + ⭐ watchlist (alerts here)\n⚡ Trade — type commands, nothing moves until you press send\n👛 Wallet — link X, see balances & deposit addresses\n\nTry: balance · buy 1 sui of $BLAST · sell 50% $BLAST · bridge 0.05 sol to sui · send 10 $BLAST to name.sui\n\nTap Guide inside the app for more."
              : "gm 💥 Track live Sui launches, trade from your OurBank wallet and get alerts.\n\nOpen the app, link X in Wallet, then use Trade. Send /help for the menu guide.",
            reply_markup: { inline_keyboard: [[{ text: "Open OURBLAST", web_app: { url: APP_URL } }]] },
          }),
        });
        if (!res.ok) console.error(`Telegram sendMessage failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
        return Response.json({ ok: true });
      },
    },
  },
});
