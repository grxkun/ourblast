// SPDX-License-Identifier: BUSL-1.1
import { staleTelegramMessage, telegramDeliveryKeys, telegramUpdateSchema, type TelegramUpdate } from "./webhookDelivery";

/** Atomic inserts claim both the delivery and (when relevant) its confirmation card. */
export async function enqueueTelegramUpdate(update: TelegramUpdate): Promise<"queued" | "ignored"> {
  if (staleTelegramMessage(update)) return "ignored";
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const keys = telegramDeliveryKeys(update);
  const { error } = await db.from("tg_webhook_receipts").insert(keys.map((delivery_key, i) => ({
    delivery_key, update_id: update.update_id, status: i === 0 ? "pending" : "done",
    payload: i === 0 ? JSON.parse(JSON.stringify(update)) : null,
  })));
  if (error?.code === "23505") return "ignored";
  if (error) throw new Error("Telegram command could not be safely saved");
  return "queued";
}

export async function processQueuedTelegramUpdate(key: string, token: string): Promise<void> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data, error } = await db.from("tg_webhook_receipts").update({ status: "processing" })
    .eq("delivery_key", key).eq("status", "pending").select("payload").maybeSingle();
  if (error) throw new Error("Telegram queue claim failed");
  if (!data) return;
  const parsed = telegramUpdateSchema.safeParse(data.payload);
  let status = "done";
  try {
    if (parsed.success && !staleTelegramMessage(parsed.data)) {
      const { processTelegramUpdate } = await import("./webhook.server");
      await processTelegramUpdate(parsed.data, token);
    }
  } catch {
    // Never re-run: a network response can be lost after a transaction lands.
    status = "needs_review";
    console.error("Telegram command interrupted; retained for review, not replayed");
  }
  await db.from("tg_webhook_receipts").update({ status, payload: null, completed_at: new Date().toISOString() }).eq("delivery_key", key);
}

/** Durable fallback if the runtime lacks waitUntil or stops before claiming work. */
export async function drainTelegramQueue(token: string): Promise<void> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data, error } = await db.from("tg_webhook_receipts").select("delivery_key").eq("status", "pending")
    .order("received_at").limit(3);
  if (error) throw new Error("Telegram queue read failed");
  for (const row of data ?? []) await processQueuedTelegramUpdate(row.delivery_key, token);
}