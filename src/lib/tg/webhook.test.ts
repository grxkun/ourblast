// SPDX-License-Identifier: BUSL-1.1
import { afterEach, describe, expect, it, vi } from "vitest";
import { actionCoinType } from "./chatTrade";

vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (config: unknown) => config }));
const run = vi.hoisted(() => vi.fn(async () => ({ reply: "Test-only receipt", linked: true })));
vi.mock("@/lib/tg/runCommand.server", () => ({ runTgCommand: run }));
import { Route } from "@/routes/api/public/telegram/webhook";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Telegram contract buy webhook", () => {
  it("keeps the pasted contract through both buttons and invokes only the confirmed command", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token-not-a-credential");
    const calls: { method: string; body: { text: string; reply_markup: { inline_keyboard: { callback_data: string }[][] } } }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ method: url.split("/").at(-1) ?? "", body: JSON.parse(String(init.body)) });
      return Response.json({ ok: true });
    }));
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("telegram-webhook:test-token-not-a-credential"));
    const secret = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const handler = (Route as unknown as { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } }).server.handlers.POST;
    const send = (update: unknown) => handler({ request: new Request("https://example.test/api/public/telegram/webhook", {
      method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": secret, "content-type": "application/json" }, body: JSON.stringify(update),
    }) });
    const ca = `0x${"c".repeat(64)}::groklet::GROKLET`;
    await send({ message: { chat: { id: 12, type: "private" }, from: { id: 12 }, text: ca } });
    const card = calls.find((c) => c.method === "sendMessage")?.body;
    if (!card) throw new Error("Missing token card");
    await send({ callback_query: { id: "ask", data: card.reply_markup.inline_keyboard[0][0].callback_data, from: { id: 12 }, message: { chat: { id: 12 }, message_id: 1, text: card.text } } });
    expect(run).not.toHaveBeenCalled();
    const confirm = calls.filter((c) => c.method === "sendMessage").at(-1)?.body;
    if (!confirm) throw new Error("Missing confirmation");
    expect(actionCoinType(confirm.text, "GROKLET")).toBe(ca);
    await send({ callback_query: { id: "go", data: confirm.reply_markup.inline_keyboard[0][0].callback_data, from: { id: 12 }, message: { chat: { id: 12 }, message_id: 2, text: confirm.text } } });
    expect(run).toHaveBeenCalledExactlyOnceWith(12, `buy 1 sui of ${ca}`);
  });
});