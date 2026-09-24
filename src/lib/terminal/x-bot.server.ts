import { runTerminalAgent } from "./agent";
import { composeXReply, X_BOT_HANDLE, type XMentionOutcome, type XMentionPayload } from "./x-bot";
import { fetchTweetImage, friendlyXError, postReply, readXCredentials } from "./x-api.server";
import { imageUrlInText } from "./xLauncher";

/** Live posting only when all four @ourblastbot credentials are saved. */
export const xBotIsLive = () => readXCredentials() !== null;

/**
 * Single entry point for launch calls arriving from X. Uses the very same parser and
 * tool registry as the web terminal — there is no X-specific command implementation.
 */
export async function handleXMention(payload: XMentionPayload, source: "webhook" | "simulation" | "poll"): Promise<XMentionOutcome> {
  const username = payload.username.replace(/^@/, "").slice(0, 40);
  const text = payload.text.trim().slice(0, 1000);

  // Never act on the bot's own tweets — its replies mention other launch
  // calls ("try: launch $DOG …") and would otherwise be parsed as new ones.
  if (username.toLowerCase() === X_BOT_HANDLE.replace(/^@/, "").toLowerCase()) {
    return {
      postId: payload.postId,
      username,
      text,
      intent: "unknown",
      status: "READY",
      reply: "",
      posted: false,
      replyPostId: null,
      postError: null,
    };
  }

  // One X post = one handled mention. The claim row is inserted BEFORE any work,
  // so polling, the search fallback, the webhook and manual ingest race on the
  // unique x_post_id constraint instead of on a check-then-act read: whoever
  // loses the insert returns the already-recorded outcome and posts nothing.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error: claimError } = await supabaseAdmin.from("x_mentions").insert({
    x_post_id: payload.postId,
    x_username: username,
    text,
    intent: "processing",
    status: "READY",
    reply_text: "",
    posted: false,
    source,
    result: {} as unknown as Record<string, never>,
  });
  if (claimError) {
    // 23505 = unique violation: another worker already claimed this tweet.
    if (claimError.code !== "23505") throw new Error(claimError.message);
    const { data: existing } = await supabaseAdmin
      .from("x_mentions")
      .select("x_username, text, intent, status, reply_text, posted, reply_post_id, post_error")
      .eq("x_post_id", payload.postId)
      .maybeSingle();
    return {
      postId: payload.postId,
      username: existing?.x_username ?? username,
      text: existing?.text ?? text,
      intent: existing?.intent ?? "unknown",
      status: (existing?.status as XMentionOutcome["status"]) ?? "READY",
      reply: existing?.reply_text ?? "",
      posted: Boolean(existing?.posted),
      replyPostId: existing?.reply_post_id ?? null,
      postError: existing?.post_error ?? null,
    };
  }

  try {
    return await processClaimedMention(payload, source, username, text);
  } catch (error) {
    // Release the claim so the next poll retries this tweet instead of it
    // staying silently stuck in "processing" forever.
    await supabaseAdmin.from("x_mentions").delete().eq("x_post_id", payload.postId).eq("posted", false);
    throw error;
  }
}

async function processClaimedMention(
  payload: XMentionPayload,
  source: "webhook" | "simulation" | "poll",
  username: string,
  text: string,
): Promise<XMentionOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const context = {
    // X mentions carry no wallet authorisation: signing always happens in the terminal.
    walletConnected: false,
    walletAddress: null,
    source: "x" as const,
    xUsername: username,
  };

  // OurBank: "send 25 SUI to @alice". Creates a request only the sender's own
  // wallet can approve in the terminal — the bot never moves anyone's funds.
  const { createBankTransferFromMention } = await import("./bank.server");
  const bankReply = await createBankTransferFromMention(payload.postId, username, text);
  if (bankReply !== null) {
    const credentials = source === "simulation" ? null : readXCredentials();
    let replyPostId: string | null = null;
    let postError: string | null = null;
    if (credentials) {
      try {
        replyPostId = await postReply(credentials, payload.postId, bankReply);
        await supabaseAdmin.from("bank_transfers").update({ reply_post_id: replyPostId }).eq("x_post_id", payload.postId);
      } catch (error) {
        postError = friendlyXError(error);
      }
    }
    await supabaseAdmin
      .from("x_mentions")
      .update({
        intent: "bankTransfer",
        status: "READY",
        reply_text: bankReply,
        posted: Boolean(replyPostId),
        reply_post_id: replyPostId,
        post_error: postError,
        posted_at: replyPostId ? new Date().toISOString() : null,
      })
      .eq("x_post_id", payload.postId);
    return { postId: payload.postId, username, text, intent: "bankTransfer", status: "READY", reply: bankReply, posted: Boolean(replyPostId), replyPostId, postError };
  }

  // Simple X launcher first: "Deploy $TETY Tety Yety Caty on Suipump" becomes one
  // launch request (one X post = one request) that a human confirms in the terminal.
  const { readDeployRequest, createLaunchRequest, composeReceivedReply, readLauncherSettings, executeLaunchRequest } =
    await import("./xLauncher.server");
  const deploy = await readDeployRequest(text);
  if (deploy) {
    // The picture on the tweet is the token image. Attached photo first; a plain
    // image link in the text is the fallback (t.co links point at the tweet, not a file).
    let iconUrl = payload.imageUrl ?? imageUrlInText(text);
    if (!iconUrl && source === "poll") {
      const credentials = readXCredentials();
      if (credentials) iconUrl = await fetchTweetImage(credentials, payload.postId);
    }
    const row = await createLaunchRequest(payload.postId, username, deploy, iconUrl, text);

    // Automatic launching: when the operator has switched it on, fire the launch
    // straight away. The outcome only ever reports DEPLOYED after the chain
    // confirms; failures are recorded on the request, never faked.
    const settings = await readLauncherSettings();
    if (settings.autoLaunchEnabled && row.status !== "DEPLOYED") {
      try {
        await executeLaunchRequest(row.id);
      } catch (error) {
        console.error(`Auto launch failed for ${row.id}: ${error instanceof Error ? error.message : "unknown"}`);
      }
    }
    const reply = composeReceivedReply(deploy);
    // No "received" reply on X: the only reply the bot posts for a launch call is the
    // deployed one, sent after the chain confirms (see xLauncher.server.ts). The
    // received text is still recorded on the mention for the status page.
    const replyPostId: string | null = null;
    const postError: string | null = null;

    // Fills in the claim row this call already inserted.
    await supabaseAdmin
      .from("x_mentions")
      .update({
        x_username: username,
        text,
        intent: "launchToken",
        status: "READY",
        reply_text: reply,
        posted: Boolean(replyPostId),
        reply_post_id: replyPostId,
        post_error: postError,
        posted_at: replyPostId ? new Date().toISOString() : null,
        source,
        result: { requestId: row.id, symbol: row.symbol, launchpad: row.launchpad } as unknown as Record<string, never>,
      })
      .eq("x_post_id", payload.postId);

    return {
      postId: payload.postId,
      username,
      text,
      intent: "launchToken",
      status: "READY",
      reply,
      posted: Boolean(replyPostId),
      replyPostId,
      postError,
    };
  }

  let { intent, result } = await runTerminalAgent(text, context);

  // Tweets are messy. When the rules cannot read one, let the model rewrite it into a
  // canonical command and run that through the very same parser and tool registry.
  if (intent.name === "unknown") {
    const { interpretFreeText } = await import("./nlu.server");
    const rewritten = await interpretFreeText(text);
    if (rewritten) {
      const retry = await runTerminalAgent(rewritten, context);
      if (retry.intent.name !== "unknown") ({ intent, result } = retry);
    }
  }

  const reply = composeXReply(result).slice(0, 600);
  const credentials = source === "simulation" ? null : readXCredentials();

  let replyPostId: string | null = null;
  let postError: string | null = null;
  if (credentials) {
    try {
      replyPostId = await postReply(credentials, payload.postId, reply);
      const { recordXBotHealth } = await import("./x-bot-health.server");
      await recordXBotHealth({ last_reply_success_at: new Date().toISOString() });
    } catch (error) {
      postError = friendlyXError(error);
    }
  }

  const outcome: XMentionOutcome = {
    postId: payload.postId,
    username,
    text,
    intent: intent.name,
    status: result.status,
    reply,
    posted: Boolean(replyPostId),
    replyPostId,
    postError,
  };

  await supabaseAdmin
    .from("x_mentions")
    .update({
      x_username: outcome.username,
      text: outcome.text,
      intent: outcome.intent,
      status: outcome.status,
      reply_text: outcome.reply,
      posted: outcome.posted,
      reply_post_id: replyPostId,
      post_error: postError,
      posted_at: replyPostId ? new Date().toISOString() : null,
      source,
      result: { live: Boolean(credentials), launch: result.launch ? { ...result.launch } : null, message: result.message } as unknown as Record<string, never>,
    })
    .eq("x_post_id", outcome.postId);

  return outcome;
}
