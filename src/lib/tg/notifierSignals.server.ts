// SPDX-License-Identifier: BUSL-1.1
/** Authenticated, read-only market listener. Never invokes snipes or wallet operations. */
import { BLAST_V2_LAUNCH_PKG } from "@/lib/blast/contracts";
import { canonicalCoin } from "./market";
import { NOTIFIER_CHANNEL, notifierPost } from "./launchNotifier";
import { notifierMetadata, telegram } from "./launchNotifier.server";
import { confirmedBlastMigration, crossedHalf, isSurging, priceChange, rankFourHourTrends, SURGE_WINDOW_MS, TREND_WINDOW_MS, type Observation } from "./notifierSignals";

type Db = typeof import("@/integrations/supabase/client.server").supabaseAdmin;
const SUI = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const r = await fetch("https://graphql.mainnet.sui.io/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`Chain read unavailable [${r.status}]`);
  const data = await r.json() as { data?: T; errors?: unknown[] };
  if (!data.data || data.errors?.length) throw new Error("Chain observation unavailable");
  return data.data;
}

export async function readMigration(coin: string, source: string): Promise<boolean> {
  if (/blast/i.test(source)) {
    const d = await gql<{ objects?: { nodes?: { asMoveObject?: { contents?: { json?: { lifecycle?: { "@variant"?: string } } } } }[] } }>(
      "query($t:String!){objects(first:1,filter:{type:$t}){nodes{asMoveObject{contents{json}}}}}", { t: `${BLAST_V2_LAUNCH_PKG}::launch::Launch<${coin}, ${SUI}>` });
    const lifecycle = d.objects?.nodes?.[0]?.asMoveObject?.contents?.json?.lifecycle?.["@variant"];
    if (!lifecycle) throw new Error("Launch lifecycle unavailable");
    return confirmedBlastMigration(lifecycle);
  }
  const { listSuipumpTokens } = await import("@/lib/terminal/suipump.server");
  const token = (await listSuipumpTokens()).find((v) => canonicalCoin(v.tokenType) === coin);
  if (!token) throw new Error("Curve state unavailable");
  if (!token.graduated || !token.poolId) return false;
  // A graduated flag alone is insufficient: verify the recorded pool exists and contains this exact token.
  const d = await gql<{ object?: { asMoveObject?: { contents?: { type?: { repr?: string } } } } }>(
    "query($a:SuiAddress!){object(address:$a){asMoveObject{contents{type{repr}}}}}", { a: token.poolId });
  const poolType = d.object?.asMoveObject?.contents?.type?.repr;
  if (!poolType) throw new Error("Migration pool unavailable");
  const args = poolType.slice(poolType.indexOf("<") + 1, poolType.lastIndexOf(">"));
  return /::pool::Pool</.test(poolType) && args.split(",").some((v) => canonicalCoin(v.trim()) === coin);
}

export async function sendChannelSignal(db: Db, key: string, kind: string, text: string, coin?: string, source?: string) {
  // Prepare reads first; a read failure cannot consume an alert or send a partial post.
  const { getScanStats } = await import("./scanInfo.server");
  const stats = coin ? await getScanStats(coin) : null;
  const meta = coin ? await notifierMetadata(coin).catch(() => ({ photo: null, socials: "" })) : null;
  const post = coin && stats ? notifierPost({ coinType: coin, symbol: stats.symbol ?? "?", pad: /blast/i.test(source ?? "") ? "blast" : "suipump" }, stats, meta?.socials ?? "") : null;
  const fullText = `${text}${post ? `\n\n${post.text}` : ""}`;
  const claim = await db.from("tg_notifier_signal_deliveries").insert({ channel: NOTIFIER_CHANNEL, signal_key: key, kind });
  if (claim.error?.code === "23505") return;
  if (claim.error) throw new Error("Signal claim unavailable");
  let photoId: number | undefined;
  try {
    if (meta?.photo) {
      const photo = await telegram("sendPhoto", { chat_id: NOTIFIER_CHANNEL, photo: meta.photo, caption: fullText.length <= 1024 ? fullText : `${text}\n<code>${escape(coin ?? "")}</code>`, parse_mode: "HTML", ...(post ? { reply_markup: post.reply_markup } : {}) });
      photoId = photo.message_id;
      if (!photoId) throw new Error("Image delivery outcome unknown");
    }
    const sent = photoId && fullText.length <= 1024 ? { message_id: photoId } : await telegram("sendMessage", { chat_id: NOTIFIER_CHANNEL, text: fullText, parse_mode: "HTML", disable_web_page_preview: true, ...(post ? { reply_markup: post.reply_markup } : {}), ...(photoId ? { reply_parameters: { message_id: photoId } } : {}) });
    if (!sent.message_id) throw new Error("Signal delivery outcome unknown");
    const saved = await db.from("tg_notifier_signal_deliveries").update({ status: "sent", message_id: sent.message_id }).eq("channel", NOTIFIER_CHANNEL).eq("signal_key", key);
    if (saved.error) throw new Error("Signal receipt could not be saved");
  } catch (error) {
    // Never automatically resend a claim after any potentially accepted public post.
    await db.from("tg_notifier_signal_deliveries").update({ status: "uncertain", message_id: photoId ?? null, error: error instanceof Error ? error.message.slice(0, 500) : "Delivery failed" }).eq("channel", NOTIFIER_CHANNEL).eq("signal_key", key);
  }
}

export async function maintainChannelSignals() {
  if (!process.env["TELEGRAM_BOT_TOKEN"]) return;
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const owner = crypto.randomUUID();
  const lease = await db.rpc("claim_notifier_listener", { p_owner: owner });
  if (lease.error) throw new Error("Listener lease unavailable");
  if (!lease.data) return;
  const started = Date.now();
  try {
    const { freshLaunches } = await import("./autoSnipe.server");
    const { maintainLaunchNotifications } = await import("./launchNotifier.server");
    const launches = await freshLaunches();
    await maintainLaunchNotifications(launches);
    const activation = await db.from("tg_notifier_listener").select("started_at").eq("id", "channel").single();
    if (activation.error || !activation.data) throw new Error("Listener activation unavailable");
    // Only launches since activation; no historical milestone spam on installation.
    const coins = launches.filter((l) => l.createdMs >= Date.parse(activation.data.started_at)).map((l) => ({ coin_type: canonicalCoin(l.coinType), source: l.pad }));
    const monitors = coins.filter((v): v is { coin_type: string; source: "blast" | "suipump" } => v.coin_type != null);
    if (monitors.length) {
      const saved = await db.from("tg_notifier_monitors").upsert(monitors, { onConflict: "coin_type", ignoreDuplicates: true });
      if (saved.error) throw new Error("Monitor registration unavailable");
    }
    const batch = await db.from("tg_notifier_monitors").select("*").order("checked_at").limit(12);
    if (batch.error) throw new Error("Monitor queue unavailable");
    const { readCoinMetadata } = await import("@/lib/terminal/sui-balances.server");
    const { readCurve } = await import("./curvePrice.server");
    const { aftermathPrices } = await import("./runCommand.server");
    const prices = await aftermathPrices([SUI, ...(batch.data ?? []).map((v) => v.coin_type)]).catch(() => ({} as Record<string, number>));
    for (const monitor of batch.data ?? []) {
      if (Date.now() - started > 80_000) break;
      const renewed = await db.from("tg_notifier_listener").update({ lease_until: new Date(Date.now() + 120_000).toISOString() }).eq("id", "channel").eq("owner", owner).select("id").maybeSingle();
      if (renewed.error || !renewed.data) throw new Error("Listener ownership lost");
      try {
        const meta = await readCoinMetadata(monitor.coin_type);
        if (!meta) throw new Error("Token metadata unavailable");
        const curve = await readCurve(monitor.coin_type, meta.decimals, monitor.source);
        if (!curve) throw new Error("Curve observation unavailable");
        const migrated = await readMigration(monitor.coin_type, monitor.source);
        const spot = curve.live ? curve.priceUsd ?? (curve.priceSui != null && prices[SUI] ? curve.priceSui * Number(prices[SUI]) : null) : migrated ? prices[monitor.coin_type] ?? null : null;
        const at = new Date().toISOString();
        const current: Observation = { coin_type: monitor.coin_type, observed_at: at, price_usd: spot != null && Number.isFinite(spot) && spot > 0 ? spot : null, price_basis: curve.live ? "curve" : migrated ? "dex" : "pending", progress: curve.progress, reserve_sui: curve.reserveSui ?? null, symbol: meta.symbol };
        const history = await db.from("tg_notifier_observations").select("*").eq("coin_type", monitor.coin_type).gte("observed_at", new Date(Date.parse(at) - SURGE_WINDOW_MS - 120_000).toISOString()).order("observed_at");
        if (history.error) throw new Error("Observation history unavailable");
        const change = priceChange(current, history.data ?? [], SURGE_WINDOW_MS);
        if (isSurging(change)) {
          const recent = await db.from("tg_notifier_signal_deliveries").select("signal_key").eq("channel", NOTIFIER_CHANNEL).eq("kind", `surge:${monitor.coin_type}`).gte("created_at", new Date(Date.parse(at) - 60 * 60_000).toISOString()).limit(1);
          if (recent.error) throw new Error("Surge cooldown unavailable");
          if (!recent.data?.length) await sendChannelSignal(db, `surge:${monitor.coin_type}:${Math.floor(Date.parse(at) / 3_600_000)}`, `surge:${monitor.coin_type}`, `📈 <b>PRICE SURGE · +${change?.toFixed(1)}% / 15m</b>\nObserved USD prices · one-hour alert cooldown`, monitor.coin_type, monitor.source);
        }
        if (crossedHalf(monitor.last_progress, current.progress)) await sendChannelSignal(db, `half:${monitor.coin_type}`, "half", `🌓 <b>50% BONDING MILESTONE</b>\nCurrent curve progress: ${((current.progress ?? 0) * 100).toFixed(1)}%`, monitor.coin_type, monitor.source);
        if (migrated && !monitor.migrated && Date.parse(monitor.checked_at) > 0) await sendChannelSignal(db, `migration:${monitor.coin_type}`, "migration", "✅ <b>MIGRATION CONFIRMED</b>\nDEX migration completed, not merely target reached.", monitor.coin_type, monitor.source);
        const stored = await db.from("tg_notifier_observations").insert(current);
        if (stored.error) throw new Error("Observation could not be saved");
        const saved = await db.from("tg_notifier_monitors").update({ checked_at: at, last_progress: current.progress, migrated }).eq("coin_type", monitor.coin_type);
        if (saved.error) throw new Error("Monitor state could not be saved");
      } catch (error) {
        // Rotate failed reads too; never substitute missing data or lose a milestone baseline.
        await db.from("tg_notifier_monitors").update({ checked_at: new Date().toISOString() }).eq("coin_type", monitor.coin_type);
        console.error("Notifier observation failed", monitor.coin_type, error instanceof Error ? error.message : "Read failed");
      }
    }
    const now = Date.now();
    if (now - Date.parse(activation.data.started_at) >= TREND_WINDOW_MS) {
      const history: Observation[] = [];
      for (let offset = 0; ; offset += 1000) {
        if (offset >= 10000) throw new Error("Trend coverage exceeds bounded read; summary withheld");
        const page = await db.rpc("notifier_trend_baselines", { p_now: new Date(now).toISOString() }).order("coin_type").order("observed_at").range(offset, offset + 999);
        if (page.error) throw new Error("Trend history unavailable");
        history.push(...(page.data ?? []));
        if ((page.data?.length ?? 0) < 1000) break;
      }
      const trends = rankFourHourTrends(history, now);
      const bucket = Math.floor(now / TREND_WINDOW_MS);
      if (trends.length) {
        const text = `🔥 <b>4-HOUR TRENDS</b>\nRanked by observed four-hour USD price gain, not newness.\n${trends.map((v, i) => `${i + 1}. <b>$${escape(v.row.symbol)}</b> +${v.change.toFixed(1)}%\n<code>${escape(v.row.coin_type)}</code>`).join("\n")}\n\n${new Date(now).toISOString()} · observed tokens only`;
        await sendChannelSignal(db, `trend:${bucket}`, "trend", text);
      }
    }
    await db.from("tg_notifier_observations").delete().lt("observed_at", new Date(now - 48 * 60 * 60_000).toISOString());
    await db.from("tg_notifier_listener").update({ last_completed_at: new Date().toISOString(), error: null }).eq("id", "channel").eq("owner", owner);
  } catch (error) {
    await db.from("tg_notifier_listener").update({ error: error instanceof Error ? error.message.slice(0, 500) : "Listener failed" }).eq("id", "channel").eq("owner", owner);
    throw error;
  } finally {
    await db.from("tg_notifier_listener").update({ lease_until: new Date().toISOString() }).eq("id", "channel").eq("owner", owner);
  }
}