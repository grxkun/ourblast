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

  const context = {
    // X mentions carry no wallet authorisation: signing always happens in the terminal.
    walletConnected: false,
    walletAddress: null,
    source: "x" as const,
    xUsername: username,
  };

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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("x_mentions").upsert(
      {
        x_post_id: payload.postId,
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
      },
      { onConflict: "x_post_id", ignoreDuplicates: true },
    );

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

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("x_mentions")
    .upsert(
      {
        x_post_id: outcome.postId,
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
      },
      { onConflict: "x_post_id", ignoreDuplicates: true },
    );

  return outcome;
}
