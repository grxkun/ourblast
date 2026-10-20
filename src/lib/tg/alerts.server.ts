// SPDX-License-Identifier: BUSL-1.1
/**
 * Telegram alerts: tells a user when a launch on their watchlist reaches a final
 * state (deployed / failed). Each watch row stores the last status it reported,
 * so a status is only ever sent once.
 */
const FINAL = new Set(["DEPLOYED", "FAILED", "UNAVAILABLE"]);

export function alertText(l: { symbol: string; status: string; launchpad: string; token_url: string | null }) {
  const ok = l.status === "DEPLOYED";
  return ok
    ? `✅ $${l.symbol} is live on ${l.launchpad}${l.token_url ? `\n${l.token_url}` : ""}`
    : `⚠️ $${l.symbol} launch on ${l.launchpad} did not complete (${l.status.toLowerCase()}).`;
}

export async function maintainTgAlerts() {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) return;
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: watches } = await db.from("tg_watchlist").select("id, tg_user_id, launch_id, notified_status").limit(500);
  if (!watches?.length) return;
  const ids = [...new Set(watches.map((w) => w.launch_id))];
  const { data: launches } = await db.from("x_launch_requests").select("id, symbol, status, launchpad, token_url").in("id", ids);
  const byId = new Map((launches ?? []).map((l) => [l.id, l]));

  for (const w of watches) {
    const l = byId.get(w.launch_id);
    if (!l || !FINAL.has(l.status) || w.notified_status === l.status) continue;
    // Claim first so a concurrent poll can't send the same alert twice.
    const { data: claimed } = await db.from("tg_watchlist").update({ notified_status: l.status }).eq("id", w.id)
      .or(w.notified_status ? `notified_status.eq.${w.notified_status}` : "notified_status.is.null").select("id");
    if (!claimed?.length) continue;
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: w.tg_user_id, text: alertText(l), disable_web_page_preview: false }),
    });
    if (!res.ok) console.error(`[tg-alert] send failed [${res.status}]: ${(await res.text()).slice(0, 200)}`);
  }
}
