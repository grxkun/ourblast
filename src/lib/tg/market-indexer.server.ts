// SPDX-License-Identifier: BUSL-1.1
import { canonicalCoin } from "./market";
import { MAIN_TOKENS } from "@/lib/terminal/mainTokens";
import { BLAST_V2_LAUNCH_PKG } from "@/lib/blast/contracts";
import { PERPSPLEXITY_ORIGINAL_PACKAGE_ID } from "@/lib/terminal/perpsplexity";
import { fetchSuiGql } from "@/lib/terminal/sui-gql-retry.server";

export const INDEX_SOURCES = {
  "suipump-v17": { name: "Suipump", type: "0xb205fea41ccedac051bc66498e6ca68cb802c4a6ea06da12e524bed09c80d9b0::bonding_curve::CurveCreated" },
  "suipump-v18": { name: "Suipump", type: "0x96a8523e464fdb6c1bb267404621cf47fcd3234d168b724b660995a420b439e3::curve::CurveCreated" },
  "blast": { name: "Blast.fun", type: `${BLAST_V2_LAUNCH_PKG}::events::LaunchShared` },
  "popular": { name: "Popular", type: "0x918d32f8a0b349584e96113ec425708374161d4798f8c28d63362602831b33ef::curve::Created" },
  "perpsplexity": { name: "Perpsplexity", type: `${PERPSPLEXITY_ORIGINAL_PACKAGE_ID}::pool::PoolCreated` },
} as const;
export type IndexSource = keyof typeof INDEX_SOURCES | "main";
async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const r = await fetchSuiGql("https://graphql.mainnet.sui.io/graphql", JSON.stringify({ query, variables }), 10_000);
  const j = await r.json() as { data?: T; errors?: { message: string }[] };
  if (!r.ok || j.errors?.length || !j.data) throw new Error("Official Sui indexing read failed");
  return j.data;
}
interface Event { timestamp: string; contents: { type: { repr: string }; json: Record<string, unknown> } }
export function eventCoin(event: Event): string | null {
  const direct = event.contents.json["meme_type"];
  if (typeof direct === "string") return canonicalCoin(direct);
  const first = event.contents.type.repr.match(/<\s*([^,>]+)/)?.[1];
  return first ? canonicalCoin(first.trim()) : null;
}
/** Only reads official events; callers cannot supply arbitrary token/price records. */
export async function syncMarketSource(source: IndexSource, before: string | null = null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const save = async (rows: { coin_type: string; symbol: string; name: string; source: string; launched_at: string | null }[]) => {
    if (!rows.length) return;
    const { error } = await supabaseAdmin.from("sui_market_catalog").upsert(rows, { onConflict: "coin_type" });
    if (error) throw new Error("Token catalog could not be saved");
  };
  if (source === "main") {
    const rows = MAIN_TOKENS.map((t) => ({ coin_type: canonicalCoin(t.coinType) ?? t.coinType, symbol: t.symbol, name: t.name, source: "Sui · Curated", launched_at: null }));
    rows.push({ coin_type: canonicalCoin("0x2::sui::SUI") ?? "0x2::sui::SUI", symbol: "SUI", name: "Sui", source: "Sui · Curated", launched_at: null });
    await save(rows); return { source, saved: rows.length, scanned: rows.length, before: null, hasMore: false };
  }
  const config = INDEX_SOURCES[source];
  const page = await gql<{ events: { nodes: Event[]; pageInfo: { hasPreviousPage: boolean; startCursor: string | null } } }>(
    `query($t:String!,$before:String){events(last:25,before:$before,filter:{type:$t}){nodes{timestamp contents{type{repr} json}} pageInfo{hasPreviousPage startCursor}}}`,
    { t: config.type, before },
  );
  const rows: { coin_type: string; symbol: string; name: string; source: string; launched_at: string | null }[] = [];
  // Bounded concurrency, and fail the page rather than advancing past unread metadata.
  const nodes = page.events.nodes;
  for (let i = 0; i < nodes.length; i += 5) {
    const batch = await Promise.all(nodes.slice(i, i + 5).map(async (e) => {
      let coin = eventCoin(e);
      if (!coin) {
        const id = e.contents.json["curve_id"];
        if (typeof id !== "string" || !/^0x[\da-fA-F]{64}$/.test(id)) return null;
        const obj = await gql<{ object: { asMoveObject: { contents: { type: { repr: string } } } | null } | null }>(
          `query($a:SuiAddress!){object(address:$a){asMoveObject{contents{type{repr}}}}}`, { a: id });
        const arg = obj.object?.asMoveObject?.contents.type.repr.match(/<\s*([^,>]+)/)?.[1];
        coin = arg ? canonicalCoin(arg.trim()) : null;
      }
      if (!coin) return null;
      const m = await gql<{ coinMetadata: { symbol: string; name: string } | null }>(
        `query($t:String!){coinMetadata(coinType:$t){symbol name}}`, { t: coin });
      if (!m.coinMetadata) return null;
      return { coin_type: coin, symbol: m.coinMetadata.symbol, name: m.coinMetadata.name, source: config.name, launched_at: e.timestamp };
    }));
    for (const row of batch) if (row) rows.push(row);
  }
  const unique = [...new Map(rows.map((r) => [r.coin_type, r])).values()];
  await save(unique);
  const timestamps = nodes.map((e) => e.timestamp).sort();
  return { source, saved: unique.length, scanned: nodes.length, before: page.events.pageInfo.startCursor, hasMore: page.events.pageInfo.hasPreviousPage,
    newest: timestamps[timestamps.length - 1] ?? null, oldest: timestamps[0] ?? null };
}