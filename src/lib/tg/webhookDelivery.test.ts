// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { staleTelegramMessage, telegramDeliveryKeys, telegramUpdateSchema } from "./webhookDelivery";

describe("Telegram delivery safety", () => {
  it("requires a stable update ID", () => {
    expect(telegramUpdateSchema.safeParse({ message: { text: "send 0.5 sui to @YoBooogie" } }).success).toBe(false);
    expect(telegramUpdateSchema.safeParse({ update_id: 123 }).success).toBe(true);
  });
  it("ignores old retried commands rather than moving funds hours later", () => {
    const update = { update_id: 123, message: { date: 1000 } };
    expect(staleTelegramMessage(update, 1600000)).toBe(false);
    expect(staleTelegramMessage(update, 1600001)).toBe(true);
  });
  it.each(["br:x:s1", "g|b|1|USDC", "pg|5", "lp", "wp", "cc"])("makes confirmation %s single-use across different update IDs", (data) => {
    const cq = { id: "one", data, from: { id: 12 }, message: { chat: { id: 12 }, message_id: 50 } };
    expect(telegramDeliveryKeys({ update_id: 100, callback_query: cq })).toEqual(["update:100", "confirm:12:50"]);
    expect(telegramDeliveryKeys({ update_id: 101, callback_query: { ...cq, id: "two" } })[1]).toBe("confirm:12:50");
  });
  it("does not lock read-only or review buttons", () => {
    expect(telegramDeliveryKeys({ update_id: 100, callback_query: { id: "x", data: "a|b|1|USDC", from: { id: 12 }, message: { chat: { id: 12 }, message_id: 50 } } })).toEqual(["update:100"]);
  });
});