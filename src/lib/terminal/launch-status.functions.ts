import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export interface PublicLaunchRow {
  id: string;
  xPostId: string;
  xUsername: string;
  tweetText: string | null;
  symbol: string | null;
  name: string | null;
  tokenAddress: string | null;
  launchpad: string | null;
  devBuy: boolean | null;
  ourblastFeePercent: number | null;
  status: string;
  notice: string | null;
  tokenUrl: string | null;
  poolUrl: string | null;
  txDigest: string | null;
  replyPostId: string | null;
  deployedReplyPostId: string | null;
  createdAt: string;
}

/**
 * Public, read-only feed for the launch status page: every tweet the bot detected,
 * what it parsed out of it, and how the launch ended. Publishable key + public
 * SELECT policies only — nothing private leaves the server.
 */
export const listPublicLaunches = createServerFn({ method: "GET" }).handler(async (): Promise<PublicLaunchRow[]> => {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const supabasePublic = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });

  // x_mentions is staff-only; the tweet text is copied onto the launch request row.
  const { data: requests, error: reqError } = await supabasePublic
    .from("x_launch_requests")
    .select(
      "id, x_post_id, x_username, symbol, name, token_address, launchpad, dev_buy, ourblast_fee_percent, status, notice, token_url, pool_url, tx_digest, reply_post_id, deployed_reply_post_id, created_at, tweet_text",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (reqError) throw new Error(reqError.message);

  const rows: PublicLaunchRow[] = (requests ?? []).map((r) => ({
    id: r.id,
    xPostId: r.x_post_id,
    xUsername: r.x_username,
    tweetText: r.tweet_text ?? null,
    symbol: r.symbol,
    name: r.name,
    tokenAddress: r.token_address,
    launchpad: r.launchpad,
    devBuy: r.dev_buy,
    ourblastFeePercent: r.ourblast_fee_percent == null ? null : Number(r.ourblast_fee_percent),
    status: r.status,
    notice: r.notice,
    tokenUrl: r.token_url,
    poolUrl: r.pool_url,
    txDigest: r.tx_digest,
    replyPostId: r.reply_post_id,
    deployedReplyPostId: r.deployed_reply_post_id,
    createdAt: r.created_at,
  }));

  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return rows;
});
