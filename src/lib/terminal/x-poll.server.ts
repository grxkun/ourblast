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

  // Replies X refused earlier (a second $cashtag in the text, duplicate content)
  // get a fresh attempt here — postReply sanitizes cashtags and de-duplicates
  // the text itself, so an old stored reply can now go through.
  const { postReply, friendlyXError } = await import("./x-api.server");
  const { data: failedReplies } = await supabaseAdmin
    .from("x_mentions")
    .select("id, x_post_id, reply_text")
    .eq("posted", false)
    .not("post_error", "is", null)
    .neq("reply_text", "")
    // Test/simulation mentions have fake post ids — X can never answer them.
    .not("x_post_id", "like", "test-%")
    .not("x_post_id", "like", "sim-%")
    .gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString())
    .order("created_at", { ascending: true })
    .limit(5);
  for (const row of failedReplies ?? []) {
    if (!row.reply_text) continue;
    try {
      const replyPostId = await postReply(credentials, row.x_post_id, row.reply_text);
      await supabaseAdmin
        .from("x_mentions")
        .update({
          reply_text: row.reply_text,
          posted: true,
          reply_post_id: replyPostId,
          post_error: null,
          posted_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    } catch (error) {
      await supabaseAdmin.from("x_mentions").update({ post_error: friendlyXError(error) }).eq("id", row.id);
    }
  }

  const newest = mentions.at(-1)?.id ?? state?.last_mention_id ?? null;
  await supabaseAdmin
    .from("x_bot_state")
    .update({ last_mention_id: newest, bot_user_id: botUserId, updated_at: new Date().toISOString() })
    .eq("id", true);

  // Retry queued automatic launches after a deployment fix or temporary chain
  // failure. executeLaunchRequest atomically claims each row, so overlapping
  // polls can never deploy the same X post twice.
  let confirmed = 0;
  const { executeLaunchRequest, readLauncherSettings } = await import("./xLauncher.server");
  const launcherSettings = await readLauncherSettings();
  const { data: open } = await supabaseAdmin
    .from("x_launch_requests")
    .select("id")
    .eq("status", "PENDING")
    .gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString())
    .limit(20);
  if (launcherSettings.autoLaunchEnabled) {
    for (const pending of open ?? []) {
      try {
        const outcome = await executeLaunchRequest(pending.id);
        if (outcome.status === "DEPLOYED") confirmed += 1;
      } catch (error) {
        console.error(`Queued launch retry failed: ${error instanceof Error ? error.message : "unknown"}`);
      }
    }
  }

  return { live: true, handled, confirmed, reason: null, error: null };
}
