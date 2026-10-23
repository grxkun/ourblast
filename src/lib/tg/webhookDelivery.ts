// SPDX-License-Identifier: BUSL-1.1
import { z } from "zod";

const chat = z.object({ id: z.number().int(), type: z.string().optional() });
const sender = z.object({ id: z.number().int().positive() });
const message = z.object({
  chat: chat.optional(), from: sender.optional(), text: z.string().max(16384).optional(),
  date: z.number().int().optional(), message_id: z.number().int().optional(),
  message_thread_id: z.number().int().optional(),
});
export const telegramUpdateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: message.optional(),
  callback_query: z.object({
    id: z.string().min(1).max(256), data: z.string().max(64).optional(), from: sender,
    message: message.extend({ chat, message_id: z.number().int() }).optional(),
  }).optional(),
});
export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

/** Old delivery retries must never replay a spend from hours ago. */
export function staleTelegramMessage(update: TelegramUpdate, nowMs = Date.now()): boolean {
  const date = update.message?.date;
  return date !== undefined && nowMs - date * 1000 > 10 * 60 * 1000;
}

/** A confirmation card is single-use, even when two taps have different update IDs. */
export function telegramDeliveryKeys(update: TelegramUpdate): string[] {
  const keys = [`update:${update.update_id}`];
  const cq = update.callback_query;
  if (cq?.message && cq.data && (/^(br:x:|g\||pg\|)/.test(cq.data) || ["lp", "wp", "cc"].includes(cq.data))) {
    keys.push(`confirm:${cq.message.chat.id}:${cq.message.message_id}`);
  }
  return keys;
}