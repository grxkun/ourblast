// SPDX-License-Identifier: BUSL-1.1
import { afterEach, describe, expect, it, vi } from "vitest";
import { actionCoinType } from "./chatTrade";

vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (config: unknown) => config }));
const run = vi.hoisted(() => vi.fn(async () => ({ reply: "Test-only receipt", linked: true })));
vi.mock("@/lib/tg/runCommand.server", () => ({ runTgCommand: run }));
const linked = vi.hoisted(() => ({ handle: "tester" as string | null }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: linked.handle ? { x_username: linked.handle } : null }) }) }) }) },
}));
import { Route } from "@/routes/api/public/telegram/webhook";
vi.mock("@/lib/tg/webhookQueue.server", () => ({
  enqueueTelegramUpdate: vi.fn(async () => "queued"),
  processQueuedTelegramUpdate: vi.fn(),
}));
import { processTelegramUpdate } from "./webhook.server";
import { enqueueTelegramUpdate, processQueuedTelegramUpdate } from "./webhookQueue.server";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Telegram contract buy webhook", () => {
  it("acknowledges before slow command work finishes and ignores delivery retries", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token-not-a-credential");
    let finish: (() => void) | undefined;
    vi.mocked(processQueuedTelegramUpdate).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("telegram-webhook:test-token-not-a-credential"));
    const secret = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const handler = (Route as unknown as { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } }).server.handlers.POST;
    const pending: Promise<unknown>[] = [];
    const send = async () => {
      const request = new Request("https://example.test/api/public/telegram/webhook", {
        method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": secret }, body: JSON.stringify({ update_id: 777 }),
      });
      Object.assign(request, { waitUntil: (work: Promise<unknown>) => pending.push(work) });
      return handler({ request });
    };
    expect((await send()).status).toBe(200);
    expect(pending).toHaveLength(1);
    expect(finish).toBeTypeOf("function");
    vi.mocked(enqueueTelegramUpdate).mockResolvedValueOnce("ignored");
    expect((await send()).status).toBe(200);
    expect(processQueuedTelegramUpdate).toHaveBeenCalledTimes(1);
    finish?.();
    await Promise.all(pending);
  });
  it("keeps the pasted contract through both buttons and invokes only the confirmed command", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token-not-a-credential");
    const calls: { method: string; body: { text: string; reply_markup: { inline_keyboard: { callback_data: string }[][] } } }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ method: url.split("/").at(-1) ?? "", body: JSON.parse(String(init.body)) });
      return Response.json({ ok: true });
    }));
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("telegram-webhook:test-token-not-a-credential"));
    const secret = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    let id = 0;
    const send = (update: object) => processTelegramUpdate({ update_id: ++id, ...update }, "test-token-not-a-credential");
    const ca = `0x${"c".repeat(64)}::groklet::GROKLET`;
    await send({ message: { chat: { id: 12, type: "private" }, from: { id: 12 }, text: ca } });
    const card = calls.find((c) => c.method === "sendMessage")?.body;
    if (!card) throw new Error("Missing token card");
    await send({ callback_query: { id: "ask", data: card.reply_markup.inline_keyboard[0]?.[0]?.callback_data, from: { id: 12 }, message: { chat: { id: 12 }, message_id: 1, text: card.text } } });
    expect(run).not.toHaveBeenCalled();
    const confirm = calls.filter((c) => c.method === "sendMessage").at(-1)?.body;
    if (!confirm) throw new Error("Missing confirmation");
    expect(actionCoinType(confirm.text, "GROKLET")).toBe(ca);
    await send({ callback_query: { id: "go", data: confirm.reply_markup.inline_keyboard[0]?.[0]?.callback_data, from: { id: 12 }, message: { chat: { id: 12 }, message_id: 2, text: confirm.text } } });
    expect(run).toHaveBeenCalledExactlyOnceWith(12, `buy 1 sui of ${ca} slippage 10%`);
  });
});