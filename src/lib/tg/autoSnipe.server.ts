// SPDX-License-Identifier: BUSL-1.1
/**
 * Auto-snipe: watches new Blast.fun (SUI-quoted) and Suipump V18 launches and buys for users whose
 * confirmed rules match. Each (rule, token) fill is claimed by a unique insert before buying, so a
 * launch is never bought twice; every buy still runs the unsigned preflight + min-output protection.
 */
import { BLAST_V2_LAUNCH_PKG } from "@/lib/blast/contracts";
import { devMatches, packKeyword, unpackKeyword, AUTO_MAX_RULES, autoBudget, ruleMatches, marketFilterMatches, marketFilterLabel, type AutoRule, type FreshLaunch } from "./autoSnipe";

const GQL = "https://graphql.mainnet.sui.io/graphql";
const SUIPUMP_V18 = "0x96a8523e464fdb6c1bb267404621cf47fcd3234d168b724b660995a420b439e3";
const SUI_RE = /^0x0*2::sui::SUI$/;

async function db() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin; }
async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  const r = await fetch(GQL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!r?.ok) return null;
  return ((await r.json().catch(() => null)) as { data?: T } | null)?.data ?? null;
}
type Ev = { timestamp: string; contents: { type: { repr: string }; json: Record<string, unknown> } };
const EV_Q = `query($t:String!){events(last:25,filter:{type:$t}){nodes{timestamp contents{type{repr} json}}}}`;

function typeArgs(repr: string): string[] {
  const inner = repr.slice(repr.indexOf("<") + 1, repr.lastIndexOf(">"));
  const out: string[] = []; let depth = 0, cur = "";
  for (const ch of inner) { if (ch === "<") depth++; if (ch === ">") depth--; if (ch === "," && !depth) { out.push(cur.trim()); cur = ""; } else cur += ch; }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export async function freshLaunches(): Promise<(FreshLaunch & { ts: string })[]> {
  const { readCoinMetadata } = await import("@/lib/terminal/sui-balances.server");
  // Both launchpads and every per-launch lookup run in parallel: detection latency is the snipe's head start.
  const [blast, sp] = await Promise.all([
    gql<{ events: { nodes: Ev[] } }>(EV_Q, { t: `${BLAST_V2_LAUNCH_PKG}::events::LaunchShared` }),
    gql<{ events: { nodes: Ev[] } }>(EV_Q, { t: `${SUIPUMP_V18}::curve::CurveCreated` }),
  ]);
  const blastRows = Promise.all((blast?.events.nodes ?? []).map(async (e): Promise<(FreshLaunch & { ts: string }) | null> => {
    const [coin, quote] = typeArgs(e.contents.type.repr);
    if (!coin || !quote || !SUI_RE.test(quote)) return null;
    const meta = await readCoinMetadata(coin).catch(() => null);
    return { pad: "blast", coinType: coin, symbol: meta?.symbol ?? coin.split("::").pop()!, name: "", createdMs: Date.parse(e.timestamp), ts: e.timestamp };
  }));
  const spRows = Promise.all((sp?.events.nodes ?? []).map(async (e): Promise<(FreshLaunch & { ts: string }) | null> => {
    const id = String(e.contents.json["curve_id"] ?? "");
    const o = id ? await gql<{ object: { asMoveObject?: { contents?: { type?: { repr?: string } } } } | null }>(`query($a:SuiAddress!){object(address:$a){asMoveObject{contents{type{repr}}}}}`, { a: id }) : null;
    const coin = typeArgs(o?.object?.asMoveObject?.contents?.type?.repr ?? "")[0];
    if (!coin) return null;
    return { pad: "suipump", coinType: coin, symbol: String(e.contents.json["symbol"] ?? ""), name: String(e.contents.json["name"] ?? ""), createdMs: Date.parse(e.timestamp), ts: e.timestamp };
  }));
  return [...(await blastRows), ...(await spRows)].filter((x): x is FreshLaunch & { ts: string } => !!x);
}

/** Poll step: new launches since the stored cursor → matching rules → protected buys. */
export async function maintainAutoSnipes() {
  const d = await db();
  const { data: rules } = await d.from("tg_snipe_filters").select("*").eq("active", true).limit(500);
  if (!rules?.length) return;
  const { data: cur } = await d.from("tg_snipe_cursor").select("last_ts").eq("source", "all").maybeSingle();
  const launches = (await freshLaunches()).sort((a, b) => a.createdMs - b.createdMs);
  if (!launches.length) return;
  const newest = launches[launches.length - 1]!.ts;
  await d.from("tg_snipe_cursor").upsert({ source: "all", last_ts: newest, updated_at: new Date().toISOString() });
  if (!cur) return; // first run only sets the baseline
  const since = Date.parse(cur.last_ts);
  const now = Date.now(), today = new Date().toISOString().slice(0, 10);
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  const say = (chat_id: number, text: string, kb?: unknown) => token ? fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id, text: text.slice(0, 4000), disable_web_page_preview: true, ...(kb ? { reply_markup: { inline_keyboard: kb } } : {}) }) }) : null;
  // Launches stay sequential so a rule's daily budget is read/written in order; different users' rules buy
  // concurrently — each (rule, token) claim is a unique insert, so parallelism can't double-buy.
  for (const l of launches.filter((x) => x.createdMs > since)) {
    let metricsP: Promise<{ mcap: number | null; reserve: number | null }> | null = null;
    await Promise.all(rules.map(async (r) => {
      if (!ruleMatches({ launchpads: r.launchpads, keyword: r.keyword, active: r.active }, l, now)) return;
      const { dev } = unpackKeyword(r.keyword);
      if (dev) {
        const { readCurve } = await import("./curvePrice.server");
        const { readCoinMetadata } = await import("@/lib/terminal/sui-balances.server");
        const meta = await readCoinMetadata(l.coinType).catch(() => null);
        const curve = await readCurve(l.coinType, meta?.decimals ?? 6).catch(() => null);
        if (!devMatches(dev, curve?.creator ?? null)) return;
      }
      if (r.min_mcap_usd != null || r.max_mcap_usd != null || r.min_reserve_sui != null) {
        metricsP ??= (async () => {
          const [{ readCoinMetadata }, { readCurve }, { livePrices }] = await Promise.all([import("@/lib/terminal/sui-balances.server"), import("./curvePrice.server"), import("./livePrice.server")]);
          const meta = await readCoinMetadata(l.coinType).catch(() => null);
          // CoinMetadata supply is circulating supply; do not substitute curve FDV supply.
          const [curve, prices, supplyData] = await Promise.all([meta ? readCurve(l.coinType, meta.decimals).catch(() => null) : Promise.resolve(null), livePrices([l.coinType]).catch(() => ({} as Record<string, number>)), gql<{ coinMetadata?: { supply?: string | null } }>("query($t:String!){coinMetadata(coinType:$t){supply}}", { t: l.coinType })]);
          const supply = supplyData?.coinMetadata?.supply != null && meta ? Number(supplyData.coinMetadata.supply) / 10 ** meta.decimals : null;
          const price = prices[l.coinType];
          return { mcap: supply != null && price != null ? supply * price : null, reserve: curve?.reserveSui ?? null };
        })();
        const metrics = await metricsP;
        if (!marketFilterMatches(r, metrics.mcap, metrics.reserve)) return;
      }
      const { data: claim } = await d.from("tg_snipe_fills").insert({ filter_id: r.id, coin_type: l.coinType }).select("id").maybeSingle();
      if (!claim) return; // already handled
      const { data: fresh } = await d.from("tg_snipe_filters").select("spent, spent_day").eq("id", r.id).single();
      const amt = autoBudget(Number(r.amount), Number(r.daily_cap), fresh?.spent_day ?? null, Number(fresh?.spent ?? 0), today);
      if (!amt) { await d.from("tg_snipe_fills").update({ result: "daily max" }).eq("id", claim.id); await say(r.tg_user_id, `⚡ Auto-snipe skipped $${l.symbol}: daily max ${r.daily_cap} SUI reached.`); return; }
      const spent = (fresh?.spent_day === today ? Number(fresh.spent) : 0) + amt;
      await d.from("tg_snipe_filters").update({ spent, spent_day: today }).eq("id", r.id);
      const { runTgCommand } = await import("./runCommand.server");
      const out = await runTgCommand(r.tg_user_id, `snipe ${l.coinType} ${amt} sui slippage ${r.slippage}%`, null, { slots: r.slots })
        .then((x) => x.reply).catch((e) => `Failed: ${(e as Error).message}. Nothing was sent unless a transaction link is shown.`);
      await d.from("tg_snipe_fills").update({ result: out.slice(0, 500) }).eq("id", claim.id);
      const bought = /suiscan|suivision|tx\//i.test(out);
      let tpsl = "";
      if (bought && (r.tp_pct || r.sl_pct)) {
        const { placeTpSl } = await import("./limitOrder.server");
        tpsl = "\n" + await placeTpSl(r.tg_user_id, l.coinType, r.tp_pct ? Number(r.tp_pct) : null, r.sl_pct ? Number(r.sl_pct) : null, r.slots, Number(r.slippage)).catch(() => "TP/SL not set.");
      }
      const { snipeExitKeyboard } = await import("./autoSnipe");
      await say(r.tg_user_id, `⚡ Auto-snipe · $${l.symbol} on ${l.pad === "blast" ? "Blast.fun" : "Suipump"}\n${l.coinType}\n${out}${tpsl}\n\nRule #${r.id.slice(0, 6)} · stop: stopsnipe ${r.id.slice(0, 6)}`, bought ? snipeExitKeyboard(l.coinType) : undefined);
    }));
  }
}

const padName = (p: string[]) => p.map((x) => (x === "blast" ? "Blast.fun" : "Suipump")).join(" + ");

export async function listAutoSnipes(tgUserId: number): Promise<string> {
  const { data } = await (await db()).from("tg_snipe_filters").select("*").eq("tg_user_id", tgUserId).order("created_at");
  if (!data?.length) return "⚡ No auto-snipe rules.\nTry: autosnipe all 2 sui max 10 sui slippage 15%";
  const today = new Date().toISOString().slice(0, 10);
  return `⚡ Auto-snipe rules (${data.length}/${AUTO_MAX_RULES})\n\n${data.map((r) => `#${r.id.slice(0, 6)} ${r.active ? "🟢" : "⏸"} ${padName(r.launchpads)} · ${r.amount} SUI each · ${r.spent_day === today ? r.spent : 0}/${r.daily_cap} SUI today · slip ${r.slippage}%${r.min_mcap_usd ? ` · Min MC $${r.min_mcap_usd}` : ""}${r.max_mcap_usd ? ` · Max MC $${r.max_mcap_usd}` : ""}${r.min_reserve_sui ? ` · Reserve ≥${r.min_reserve_sui} SUI` : ""}${unpackKeyword(r.keyword).keyword ? ` · "${unpackKeyword(r.keyword).keyword}"` : ""}${unpackKeyword(r.keyword).dev ? ` · dev ${unpackKeyword(r.keyword).dev!.slice(0, 8)}…` : ""}${r.tp_pct ? ` · TP +${r.tp_pct}%` : ""}${r.sl_pct ? ` · SL −${r.sl_pct}%` : ""} · ${r.slots.map((s: number) => `w${s}`).join(",")}`).join("\n")}\n\npausesnipe <id|all> · resumesnipe <id|all> · stopsnipe <id|all>`;
}

export async function saveAutoSnipe(tgUserId: number, r: AutoRule, selected: number[]): Promise<string> {
  const d = await db();
  const slots = r.slots?.length ? r.slots : selected;
  const { count } = await d.from("tg_snipe_filters").select("id", { count: "exact", head: true }).eq("tg_user_id", tgUserId);
  if ((count ?? 0) >= AUTO_MAX_RULES) return `You have ${AUTO_MAX_RULES} rules (the max). Stop one first: stopsnipe <id>`;
  const { data, error } = await d.from("tg_snipe_filters").insert({ tg_user_id: tgUserId, launchpads: r.pads, keyword: packKeyword(r.keyword, r.dev), amount: Number(r.amount), daily_cap: Number(r.dailyCap), slippage: Number(r.slippage), slots, tp_pct: r.tp ? Number(r.tp) : null, sl_pct: r.sl ? Number(r.sl) : null, min_mcap_usd: r.minMc ? Number(r.minMc) : null, max_mcap_usd: r.maxMc ? Number(r.maxMc) : null, min_reserve_sui: r.minLiq ? Number(r.minLiq) : null }).select("id").single();
  if (error || !data) return "Couldn't save the rule. Nothing will be bought.";
  return `⚡ Auto-snipe ON (#${data.id.slice(0, 6)})\n${padName(r.pads)} · ${r.amount} SUI per new launch · max ${r.dailyCap} SUI/day · slip ${r.slippage}%${r.keyword ? ` · only "${r.keyword}"` : ""}${r.tp || r.sl ? `\nAuto-exit: ${r.tp ? `TP +${r.tp}%` : ""}${r.tp && r.sl ? " · " : ""}${r.sl ? `SL −${r.sl}%` : ""} (sells 100%)` : ""}\n${marketFilterLabel(r) ? `Filters: ${marketFilterLabel(r)}\n` : ""}Wallets: ${slots.map((s) => `w${s}`).join(", ")}\nStarts with the next launch. Each buy is simulated first; you get a receipt.\nStop: stopsnipe ${data.id.slice(0, 6)}`;
}

export async function controlAutoSnipe(tgUserId: number, op: "stop" | "pause" | "resume", id: string): Promise<string> {
  const d = await db();
  const { data: mine } = await d.from("tg_snipe_filters").select("id").eq("tg_user_id", tgUserId);
  const ids = (mine ?? []).map((x) => x.id).filter((x) => id === "all" || x.startsWith(id));
  if (!ids.length) return "No auto-snipe rule matched.";
  if (op === "stop") { await d.from("tg_snipe_filters").delete().in("id", ids); return `🛑 Removed ${ids.length} auto-snipe rule(s).`; }
  await d.from("tg_snipe_filters").update({ active: op === "resume" }).in("id", ids);
  return `${op === "resume" ? "▶️ Resumed" : "⏸ Paused"} ${ids.length} rule(s).`;
}

export async function autoSnipeReview(r: AutoRule, walletCount: number): Promise<string> {
  return `⚡ Auto-snipe review\nBuy every new ${padName(r.pads)} launch${r.keyword ? ` whose name/ticker contains "${r.keyword}"` : ""}\n${r.amount} SUI per launch per wallet (${r.slots?.length ? r.slots.map((x) => `w${x}`).join(",") : `${walletCount} selected`}) · max ${r.dailyCap} SUI/day · slip ${r.slippage}%${r.tp || r.sl ? `\nAuto-exit after each buy: ${r.tp ? `take-profit +${r.tp}%` : ""}${r.tp && r.sl ? " · " : ""}${r.sl ? `stop-loss −${r.sl}%` : ""} (sells 100%, one cancels the other)` : ""}\n${marketFilterLabel(r) ? `Filters: ${marketFilterLabel(r)}. Unavailable metrics are skipped.\n` : ""}Only launches under 10 minutes old. Each buy is simulated first and protected by min-output; new launches can still lose value fast.\n\nRuns automatically after you confirm.`;
}
