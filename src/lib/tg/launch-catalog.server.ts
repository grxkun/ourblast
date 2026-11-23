// SPDX-License-Identifier: BUSL-1.1
import { canonicalCoin } from "./market";
import type { FreshLaunch } from "./autoSnipe";

/** Internal only: persist launches already read from official chain events, never execute trades. */
export async function saveDetectedLaunches(launches: (FreshLaunch & { ts: string })[]) {
  const rows = new Map<string, { coin_type: string; symbol: string; name: string; source: string; launched_at: string }>();
  for (const launch of launches) {
    const coin = canonicalCoin(launch.coinType);
    if (!coin || !Number.isFinite(Date.parse(launch.ts))) continue;
    const row = { coin_type: coin, symbol: launch.symbol, name: launch.name, source: launch.pad === "blast" ? "Blast.fun" : "Suipump", launched_at: launch.ts };
    const prior = rows.get(coin);
    if (!prior || Date.parse(prior.launched_at) < Date.parse(row.launched_at)) rows.set(coin, row);
  }
  if (!rows.size) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // The dedicated indexer can enrich names later; replay must not erase its existing metadata.
  const { error } = await supabaseAdmin.from("sui_market_catalog").upsert([...rows.values()], { onConflict: "coin_type", ignoreDuplicates: true });
  if (error) throw new Error("Detected launches could not be saved to Discover");
}