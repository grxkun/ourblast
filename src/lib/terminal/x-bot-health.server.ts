/**
 * Records X bot health milestones (last successful poll, search fallback, reply)
 * on the single-row x_bot_state table so the admin dashboard can show liveness.
 */
export async function recordXBotHealth(patch: {
  last_poll_success_at?: string;
  last_search_success_at?: string;
  last_reply_success_at?: string;
  last_poll_error?: string | null;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("x_bot_state").update(patch).eq("id", true);
  } catch {
    // Health bookkeeping must never break the bot itself.
  }
}
