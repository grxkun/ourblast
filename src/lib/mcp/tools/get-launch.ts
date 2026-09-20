import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseAnon } from "../supabase";

export default defineTool({
  name: "get_launch",
  title: "Get launch status",
  description:
    "Look up one token launch by its ticker (e.g. HMMM) or the X post id it came from, including the original tweet text and any on-chain transaction digest.",
  inputSchema: {
    symbol: z.string().trim().min(1).optional().describe("Token ticker, with or without the leading $."),
    xPostId: z.string().trim().min(1).optional().describe("The X post id the launch call came from."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ symbol, xPostId }) => {
    if (!symbol && !xPostId) throw new ToolError("Provide either a symbol or an xPostId.");
    const supabase = supabaseAnon();

    let query = supabase
      .from("x_launch_requests")
      .select(
        "id, x_post_id, x_username, symbol, name, launchpad, dev_buy, ourblast_fee_percent, status, notice, token_url, pool_url, tx_digest, reply_post_id, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(1);
    query = xPostId ? query.eq("x_post_id", xPostId) : query.ilike("symbol", symbol!.replace(/^\$/, ""));

    const { data, error } = await query;
    if (error) throw new ToolError(error.message);
    const row = data?.[0];
    if (!row) throw new ToolError("No launch call found for that ticker or post id.");

    const { data: mention } = await supabase
      .from("x_mentions")
      .select("text")
      .eq("x_post_id", row.x_post_id)
      .limit(1);

    const launch = {
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      launchpad: row.launchpad,
      status: row.status,
      notice: row.notice,
      devBuy: row.dev_buy,
      ourblastFeePercent: row.ourblast_fee_percent == null ? null : Number(row.ourblast_fee_percent),
      txDigest: row.tx_digest,
      transactionUrl: row.tx_digest ? `https://suivision.xyz/txblock/${row.tx_digest}` : null,
      tokenUrl: row.token_url,
      poolUrl: row.pool_url,
      requestedBy: row.x_username,
      tweetText: mention?.[0]?.text ?? null,
      tweetUrl: `https://x.com/${row.x_username}/status/${row.x_post_id}`,
      botReplyUrl: row.reply_post_id ? `https://x.com/ourblastbot/status/${row.reply_post_id}` : null,
      createdAt: row.created_at,
    };

    return {
      content: [
        {
          type: "text",
          text: `$${launch.symbol ?? "?"} ${launch.name ?? ""} — ${launch.status}${launch.notice ? ` (${launch.notice})` : ""}`,
        },
      ],
      structuredContent: { launch },
    };
  },
});
