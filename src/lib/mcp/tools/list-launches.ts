// SPDX-License-Identifier: BUSL-1.1
import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseAnon } from "../supabase";

export default defineTool({
  name: "list_launches",
  title: "List token launches",
  description:
    "List the token launch calls the OurBlast X bot has detected, with the parsed ticker, name, launchpad, status and transaction links. Same data as the public launch status page.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(20).describe("How many launches to return, newest first."),
    status: z
      .string()
      .trim()
      .optional()
      .describe("Optional status filter, e.g. PENDING, LAUNCHING, DEPLOYED, FAILED."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, status }) => {
    const supabase = supabaseAnon();
    let query = supabase
      .from("x_launch_requests")
      .select(
        "id, x_post_id, x_username, symbol, name, launchpad, dev_buy, ourblast_fee_percent, status, notice, token_url, pool_url, tx_digest, reply_post_id, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) query = query.eq("status", status.toUpperCase());

    const { data, error } = await query;
    if (error) throw new ToolError(error.message);

    const launches = (data ?? []).map((row) => ({
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      launchpad: row.launchpad,
      status: row.status,
      notice: row.notice,
      devBuy: row.dev_buy,
      ourblastFeePercent: row.ourblast_fee_percent == null ? null : Number(row.ourblast_fee_percent),
      txDigest: row.tx_digest,
      tokenUrl: row.token_url,
      poolUrl: row.pool_url,
      requestedBy: row.x_username,
      tweetUrl: `https://x.com/${row.x_username}/status/${row.x_post_id}`,
      createdAt: row.created_at,
    }));

    const text = launches.length
      ? launches
          .map((l) => `$${l.symbol ?? "?"} ${l.name ?? ""} — ${l.status} on ${l.launchpad ?? "?"} (@${l.requestedBy})`)
          .join("\n")
      : "No launch calls found.";

    return { content: [{ type: "text", text }], structuredContent: { launches } };
  },
});
