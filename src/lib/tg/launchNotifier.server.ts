// SPDX-License-Identifier: BUSL-1.1
import type { FreshLaunch } from "./autoSnipe";
import { canonicalCoin } from "./market";
import { NOTIFIER_CHANNEL, notifierEligible, notifierPost, notifierSocials, publicUrl } from "./launchNotifier";
import { getScanStats } from "./scanInfo.server";

class TelegramRejected extends Error {
  constructor(public status: number, body: string) { super(`Telegram [${status}]: ${body}`); }
}
export async function telegram(method: string, body: Record<string, unknown>): Promise<{ message_id?: number }> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) throw new Error("Telegram bot is not configured");
  // Reuse the application's existing direct Bot API credential; never expose it to clients or logs.
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  } catch { throw new Error("Telegram delivery outcome unknown; automatic resend disabled"); }
  const raw = await response.text();
  let data: { ok?: boolean; result?: { message_id?: number }; error_code?: number };
  try { data = JSON.parse(raw) as typeof data; } catch { throw new Error("Telegram delivery outcome unknown; invalid response"); }
  if (!response.ok || !data.ok) {
    // A server failure can happen after acceptance; only explicit 4xx rejections are safe to fall back.
    if (response.status >= 500 || (data.error_code ?? 0) >= 500) throw new Error(`Telegram delivery outcome unknown [${response.status}]`);
    console.error(`Telegram notifier rejected [${response.status}]: ${raw}`);
    throw new TelegramRejected(data.error_code ?? response.status, raw);
  }
  return data.result ?? {};
}
export async function notifierMetadata(coinType: string) {
  const r = await fetch("https://graphql.mainnet.sui.io/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "query($t:String!){coinMetadata(coinType:$t){iconUrl description}}", variables: { t: coinType } }), signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error("Token image metadata unavailable");
  const j = await r.json() as { data?: { coinMetadata?: { iconUrl?: string; description?: string } | null } };
  const m = j.data?.coinMetadata;
  return { photo: publicUrl(m?.iconUrl), socials: notifierSocials(m?.description ?? "") };
}

/** Called only from the authenticated launch poller. No backfill, trades, or automatic replay of uncertain sends. */
export async function maintainLaunchNotifications(launches: (FreshLaunch & { ts: string })[], options: { authorizedTestBatch?: boolean } = {}) {
  if (!process.env["TELEGRAM_BOT_TOKEN"]) return;
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const channel = NOTIFIER_CHANNEL;
  const initialized = await db.from("tg_launch_notifier_state").upsert({ channel }, { onConflict: "channel", ignoreDuplicates: true });
  if (initialized.error) throw new Error("Notifier activation could not be saved");
  const state = await db.from("tg_launch_notifier_state").select("started_at").eq("channel", channel).single();
  if (state.error || !state.data) throw new Error("Notifier activation could not be read");
  const now = Date.now();
  const rows = new Map<string, { channel: string; coin_type: string; launched_at: string; launchpad: string }>();
  for (const l of launches) {
    const coin = canonicalCoin(l.coinType);
    if (coin && (options.authorizedTestBatch ? Number.isFinite(l.createdMs) && l.createdMs <= now : notifierEligible(l, Date.parse(state.data.started_at), now))) rows.set(coin, { channel, coin_type: coin, launched_at: l.ts, launchpad: l.pad });
  }
  if (rows.size) {
    const saved = await db.from("tg_launch_notifications").upsert([...rows.values()], { onConflict: "channel,coin_type", ignoreDuplicates: true });
    if (saved.error) throw new Error("Notifier launch queue could not be saved");
  }
  let query = db.from("tg_launch_notifications").select("coin_type,launched_at,launchpad").eq("channel", channel).eq("status", "pending");
  if (options.authorizedTestBatch) {
    if (!rows.size) return;
    query = query.in("coin_type", [...rows.keys()]);
  }
  const pending = await query.order("launched_at").limit(options.authorizedTestBatch ? 5 : 3);
  if (pending.error) throw new Error("Notifier launch queue unavailable");
  for (const row of pending.data ?? []) {
    // Prepare before claiming: read failures are retryable and cannot have posted anything.
    const stats = await getScanStats(row.coin_type).catch(() => null);
    if (!stats) continue;
    const meta = await notifierMetadata(row.coin_type).catch(() => ({ photo: null, socials: "" }));
    const launch = launches.find((l) => canonicalCoin(l.coinType) === row.coin_type);
    const pad = launch?.pad ?? (row.launchpad === "blast" ? "blast" : row.launchpad === "suipump" ? "suipump" : null);
    if (!pad) continue; // Never guess provenance when an old queue row lacks it.
    const post = notifierPost({ coinType: row.coin_type, symbol: stats.symbol ?? launch?.symbol ?? "?", pad }, stats, meta.socials);
    const claimed = await db.from("tg_launch_notifications").update({ status: "sending", updated_at: new Date().toISOString() }).eq("channel", channel).eq("coin_type", row.coin_type).eq("status", "pending").select("coin_type").maybeSingle();
    if (claimed.error) throw new Error("Notifier delivery claim unavailable");
    if (!claimed.data) continue;
    let photoId: number | undefined;
    try {
      let sent: { message_id?: number } | null = null;
      if (meta.photo) {
        try {
          sent = await telegram("sendPhoto", { chat_id: channel, photo: meta.photo, caption: post.text.length <= 1024 ? post.text : post.photoCaption, parse_mode: "HTML", ...(post.text.length <= 1024 ? { reply_markup: post.reply_markup } : {}) });
          photoId = sent.message_id;
        } catch (e) { if (!(e instanceof TelegramRejected) || e.status !== 400) throw e; }
      }
      if (!sent || post.text.length > 1024) sent = await telegram("sendMessage", { chat_id: channel, text: post.text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: post.reply_markup, ...(photoId ? { reply_parameters: { message_id: photoId } } : {}) });
      if (!sent.message_id) throw new Error("Telegram accepted delivery without a message ID; automatic resend disabled");
      const saved = await db.from("tg_launch_notifications").update({ status: "sent", message_id: sent.message_id, error: null, updated_at: new Date().toISOString() }).eq("channel", channel).eq("coin_type", row.coin_type);
      if (saved.error) console.error("Notifier receipt save failed; sending claim retained", row.coin_type);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown delivery failure";
      const result = await db.from("tg_launch_notifications").update({ status: photoId || !(e instanceof TelegramRejected) ? "uncertain" : "failed", message_id: photoId ?? null, error: message.slice(0, 1500), updated_at: new Date().toISOString() }).eq("channel", channel).eq("coin_type", row.coin_type);
      if (result.error) console.error("Notifier failure save failed; sending claim retained", row.coin_type);
      console.error("Notifier delivery stopped", message);
    }
  }
}