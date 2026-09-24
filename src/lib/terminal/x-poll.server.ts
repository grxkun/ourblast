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
  const { readXCredentials, getBotAccount, listMentions, searchMentions } = await import("./x-api.server");
  const credentials = readXCredentials();
  if (!credentials) return { live: false, handled: 0, confirmed: 0, reason: "X credentials not saved yet", error: null };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: state } = await supabaseAdmin
    .from("x_bot_state")
    .select("last_mention_id, bot_user_id, last_search_success_at")
    .eq("id", true)
    .maybeSingle();

  let botUserId = state?.bot_user_id ?? null;
  let mentions;
  try {
    if (!botUserId) botUserId = (await getBotAccount(credentials)).id;
    const sinceId = state?.last_mention_id ?? null;
    // Two sources: the mentions timeline sometimes stalls for hours, so recent
    // search runs alongside it. Results are merged, de-duplicated, oldest first.
    const timeline = await listMentions(credentials, botUserId, sinceId);
    const { recordXBotHealth } = await import("./x-bot-health.server");
    let searched: Awaited<ReturnType<typeof searchMentions>> = [];
    // The poll now runs every 15s; the search fallback stays at roughly once a
    // minute so the faster cadence does not multiply X search rate-limit usage.
    const lastSearch = state?.last_search_success_at ? Date.parse(state.last_search_success_at) : 0;
    const searchDue = !lastSearch || Date.now() - lastSearch > 45_000;
    if (searchDue) {
      try {
        searched = await searchMentions(credentials, "ourblastbot", sinceId);
        await recordXBotHealth({ last_search_success_at: new Date().toISOString() });
      } catch (error) {
        console.error(`X mention search failed: ${error instanceof Error ? error.message : "unknown"}`);
      }
    }
    const byId = new Map<string, (typeof timeline)[number]>();
    for (const item of [...timeline, ...searched]) if (!byId.has(item.id)) byId.set(item.id, item);
    mentions = [...byId.values()].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  } catch (error) {
    const message = error instanceof Error ? error.message : "X read failed";
    console.error(`X mention poll failed: ${message}`);
    const { recordXBotHealth } = await import("./x-bot-health.server");
    await recordXBotHealth({ last_poll_error: message.slice(0, 500) });
    return { live: true, handled: 0, confirmed: 0, reason: null, error: message.slice(0, 500) };
  }
  const { handleXMention } = await import("./x-bot.server");

  let handled = 0;
  // Oldest mention that failed this run: the cursor must not move past it,
  // otherwise the next poll would never see it again.
  let firstFailedIndex = -1;
  for (const [index, mention] of mentions.entries()) {
    // Skip the bot's own tweets — a reply quoting a launch example must never
    // be re-ingested as a new launch call.
    if ((mention.username ?? "").replace(/^@/, "").toLowerCase() === "ourblastbot") continue;
    // Cheap pre-filter only; handleXMention claims the tweet atomically, so a
    // tweet arriving from both the timeline and the search fallback (or from two
    // overlapping polls) is still answered exactly once.
    const { data: seen } = await supabaseAdmin
      .from("x_mentions")
      .select("id")
      .eq("x_post_id", mention.id)
      .maybeSingle();
    if (seen) continue;

    try {
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
    } catch (error) {
      if (firstFailedIndex === -1) firstFailedIndex = index;
      console.error(`X mention ${mention.id} failed, will retry: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  // A run killed mid-way (time limit) can't run its catch block, so its claim
  // row stays "processing" forever and the cursor has already moved past it.
  // Re-handle such rows after 3 minutes — but only when nothing was recorded
  // for that tweet yet (no transfer/trade, no launch request), so no action
  // that may have touched the chain is ever repeated.
  const { data: stale } = await supabaseAdmin
    .from("x_mentions")
    .select("x_post_id, x_username, text")
    .eq("intent", "processing")
    .eq("posted", false)
    .lt("created_at", new Date(Date.now() - 3 * 60_000).toISOString())
    .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString())
    .limit(3);
  for (const row of stale ?? []) {
    const [{ data: transfer }, { data: launch }] = await Promise.all([
      supabaseAdmin.from("bank_transfers").select("id").eq("x_post_id", row.x_post_id).maybeSingle(),
      supabaseAdmin.from("x_launch_requests").select("id").eq("x_post_id", row.x_post_id).maybeSingle(),
    ]);
    if (transfer || launch) continue;
    const { data: released } = await supabaseAdmin
      .from("x_mentions")
      .delete()
      .eq("x_post_id", row.x_post_id)
      .eq("intent", "processing")
      .eq("posted", false)
      .select("id");
    if (!released?.length) continue;
    try {
      await handleXMention({ postId: row.x_post_id, username: row.x_username ?? "", text: row.text ?? "", imageUrl: null }, "poll");
      handled += 1;
    } catch (error) {
      console.error(`Stale mention ${row.x_post_id} retry failed: ${error instanceof Error ? error.message : "unknown"}`);
    }
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
      const { recordXBotHealth } = await import("./x-bot-health.server");
      await recordXBotHealth({ last_reply_success_at: new Date().toISOString() });
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

  const newest =
    (firstFailedIndex === -1 ? mentions.at(-1)?.id : mentions[firstFailedIndex - 1]?.id) ??
    state?.last_mention_id ??
    null;
  await supabaseAdmin
    .from("x_bot_state")
    .update({
      last_mention_id: newest,
      bot_user_id: botUserId,
      updated_at: new Date().toISOString(),
      last_poll_success_at: new Date().toISOString(),
      last_poll_error: null,
    })
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

  try {
    const { maintainBankTransfers } = await import("./bank.server");
    await maintainBankTransfers();
  } catch (error) {
    console.error(`OurBank maintenance failed: ${error instanceof Error ? error.message : "unknown"}`);
  }

  return { live: true, handled, confirmed, reason: null, error: null };
}
