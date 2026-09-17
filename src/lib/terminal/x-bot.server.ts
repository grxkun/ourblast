import { runTerminalAgent } from "./agent";
import { composeXReply, X_BOT_DRY_RUN, type XMentionOutcome, type XMentionPayload } from "./x-bot";

/**
 * Single entry point for launch calls arriving from X. Uses the very same parser and
 * tool registry as the web terminal — there is no X-specific command implementation.
 */
export async function handleXMention(payload: XMentionPayload, source: "webhook" | "simulation"): Promise<XMentionOutcome> {
  const username = payload.username.replace(/^@/, "").slice(0, 40);
  const text = payload.text.trim().slice(0, 1000);

  const { intent, result } = await runTerminalAgent(text, {
    // X mentions carry no wallet authorisation: signing always happens in the terminal.
    walletConnected: false,
    walletAddress: null,
    source: "x",
    xUsername: username,
  });

  const reply = composeXReply(result).slice(0, 600);
  const outcome: XMentionOutcome = {
    postId: payload.postId,
    username,
    text,
    intent: intent.name,
    status: result.status,
    reply,
    posted: false,
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
        source,
        result: { dryRun: X_BOT_DRY_RUN, launch: result.launch ?? null, message: result.message },
      },
      { onConflict: "x_post_id", ignoreDuplicates: true },
    );

  return outcome;
}
