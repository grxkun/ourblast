/**
 * Shared mention-poll routine: reads new @ourblastbot mentions, answers each launch
 * call exactly once, and re-checks open Suipump requests. Used by the scheduled
 * /api/public/x-poll route and the admin "check now" action.
 */
export async function runXMentionPoll(): Promise<{
  live: boolean;
  handled: number;
  confirmed: number;
  reason: string | null;
  error: string | null;
}> {
  const { readXCredentials, getBotAccount, listMentions } = await import("./x-api.server");
  const credentials = readXCredentials();
  if (!credentials) return { live: false, handled: 0, confirmed: 0, reason: "X credentials not saved yet", error: null };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: state } = await supabaseAdmin
    .from("x_bot_state")
    .select("last_mention_id, bot_user_id")
    .eq("id", true)
    .maybeSingle();

  let botUserId = state?.bot_user_id ?? null;
  let mentions;
  try {
    if (!botUserId) botUserId = (await getBotAccount(credentials)).id;
    mentions = await listMentions(credentials, botUserId, state?.last_mention_id ?? null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "X read failed";
    console.error(`X mention poll failed: ${message}`);
    return { live: true, handled: 0, confirmed: 0, reason: null, error: message.slice(0, 500) };
  }
  const { handleXMention } = await import("./x-bot.server");

  let handled = 0;
  for (const mention of mentions) {
    // Skip the bot's own tweets — a reply quoting a launch example must never
    // be re-ingested as a new launch call.
    if ((mention.username ?? "").replace(/^@/, "").toLowerCase() === "ourblastbot") continue;
    const { data: seen } = await supabaseAdmin
      .from("x_mentions")
      .select("id")
      .eq("x_post_id", mention.id)
      .maybeSingle();
    if (seen) continue;

    await handleXMention(
      {
        postId: mention.id,
        username: mention.username ?? "",
        text: mention.text,
        imageUrl: mention.imageUrl ?? null,
      },
      "poll",
    );
    handled += 1;
  }

  const newest = mentions.at(-1)?.id ?? state?.last_mention_id ?? null;
  await supabaseAdmin
    .from("x_bot_state")
    .update({ last_mention_id: newest, bot_user_id: botUserId, updated_at: new Date().toISOString() })
    .eq("id", true);

  // Someone may have created the token by hand on Suipump: confirm it on chain
  // and reply with the real token link, without ever guessing.
  let confirmed = 0;
  const { confirmSuipumpLaunch } = await import("./xLauncher.server");
  const { data: open } = await supabaseAdmin
    .from("x_launch_requests")
    .select("id")
    .eq("launchpad", "suipump")
    .in("status", ["PENDING", "UNAVAILABLE"])
    .gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString())
    .limit(20);
  for (const pending of open ?? []) {
    try {
      const outcome = await confirmSuipumpLaunch(pending.id);
      if (outcome.status === "DEPLOYED") confirmed += 1;
    } catch (error) {
      console.error(`Suipump confirm failed: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  return { live: true, handled, confirmed, reason: null, error: null };
}
