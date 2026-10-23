// SPDX-License-Identifier: BUSL-1.1
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>(), fail: false }));
const process = vi.hoisted(() => vi.fn(async () => Response.json({ ok: true })));
vi.mock("./webhook.server", () => ({ processTelegramUpdate: process }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => ({
  insert: async (rows: Record<string, unknown>[]) => {
    if (state.fail) return { error: { code: "503" } };
    if (rows.some((r) => state.rows.has(String(r.delivery_key)))) return { error: { code: "23505" } };
    for (const r of rows) state.rows.set(String(r.delivery_key), { ...r });
    return { error: null };
  },
  update: (values: Record<string, unknown>) => {
    const filters: Record<string, unknown> = {};
    const query = {
      eq: (k: string, v: unknown) => { filters[k] = v; return query; },
      select: () => query,
      maybeSingle: async () => {
        const row = state.rows.get(String(filters.delivery_key));
        if (!row || Object.entries(filters).some(([k, v]) => row[k] !== v)) return { data: null, error: null };
        Object.assign(row, values);
        return { data: { payload: row.payload }, error: null };
      },
      then: (resolve: (v: unknown) => unknown) => {
        const row = state.rows.get(String(filters.delivery_key));
        if (row) Object.assign(row, values);
        return Promise.resolve(resolve({ error: null }));
      },
    };
    return query;
  },
}) } }));
import { enqueueTelegramUpdate, processQueuedTelegramUpdate } from "./webhookQueue.server";

beforeEach(() => { state.rows.clear(); state.fail = false; process.mockReset(); process.mockResolvedValue(Response.json({ ok: true })); });
describe("durable Telegram retries", () => {
  it("runs Mamoun's retried 0.5 SUI command exactly once", async () => {
    const update = { update_id: 99, message: { from: { id: 5581749567 }, chat: { id: 5581749567, type: "private" }, text: "send 0.5 SUI to @YoBooogie" } };
    expect(await enqueueTelegramUpdate(update)).toBe("queued");
    expect(await enqueueTelegramUpdate(update)).toBe("ignored");
    await Promise.all([processQueuedTelegramUpdate("update:99", "test-token"), processQueuedTelegramUpdate("update:99", "test-token")]);
    expect(process).toHaveBeenCalledTimes(1);
    expect(state.rows.get("update:99")?.status).toBe("done");
  });
  it("does not submit twice on repeated confirmation taps", async () => {
    const cq = { id: "a", data: "g|b|1|USDC", from: { id: 12 }, message: { chat: { id: 12 }, message_id: 50 } };
    expect(await enqueueTelegramUpdate({ update_id: 1, callback_query: cq })).toBe("queued");
    expect(await enqueueTelegramUpdate({ update_id: 2, callback_query: { ...cq, id: "b" } })).toBe("ignored");
    expect(state.rows.has("update:2")).toBe(false);
  });
  it("retains uncertain work for review instead of replaying", async () => {
    process.mockRejectedValueOnce(new Error("lost submit response"));
    await enqueueTelegramUpdate({ update_id: 3 });
    await processQueuedTelegramUpdate("update:3", "test-token");
    await processQueuedTelegramUpdate("update:3", "test-token");
    expect(process).toHaveBeenCalledTimes(1);
    expect(state.rows.get("update:3")?.status).toBe("needs_review");
  });
  it("fails closed when the durable claim cannot be saved", async () => {
    state.fail = true;
    await expect(enqueueTelegramUpdate({ update_id: 4 })).rejects.toThrow("could not be safely saved");
    expect(process).not.toHaveBeenCalled();
  });
});