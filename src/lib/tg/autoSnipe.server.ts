// SPDX-License-Identifier: BUSL-1.1
/**
 * Auto-snipe: watches new Blast.fun (SUI-quoted) and Suipump V18 launches and buys for users whose
 * confirmed rules match. Each (rule, token) fill is claimed by a unique insert before buying, so a
 * launch is never bought twice; every buy still runs the unsigned preflight + min-output protection.
 */
import { BLAST_V2_LAUNCH_PKG } from "@/lib/blast/contracts";
import { AUTO_MAX_RULES, autoBudget, ruleMatches, type AutoRule, type FreshLaunch } from "./autoSnipe";

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
  const out: (FreshLaunch & { ts: string })[] = [];
  const blast = await gql<{ events: { nodes: Ev[] } }>(EV_Q, { t: `${BLAST_V2_LAUNCH_PKG}::events::LaunchShared` });
  for (const e of blast?.events.nodes ?? []) {
    const [coin, quote] = typeArgs(e.contents.type.repr);
    if (!coin || !quote || !SUI_RE.test(quote)) continue;
    const meta = await readCoinMetadata(coin).catch(() => null);
    out.push({ pad: "blast", coinType: coin, symbol: meta?.symbol ?? coin.split("::").pop()!, name: "", createdMs: Date.parse(e.timestamp), ts: e.timestamp });
  }
  const sp = await gql<{ events: { nodes: Ev[] } }>(EV_Q, { t: `${SUIPUMP_V18}::curve::CurveCreated` });
  for (const e of sp?.events.nodes ?? []) {
    const id = String(e.contents.json["curve_id"] ?? "");
    const o = id ? await gql<{ object: { asMoveObject?: { contents?: { type?: { repr?: string } } } } | null }>(`query($a:SuiAddress!){object(address:$a){asMoveObject{contents{type{repr}}}}}`, { a: id }) : null;
    const coin = typeArgs(o?.object?.asMoveObject?.contents?.type?.repr ?? "")[0];
    if (!coin) continue;
    out.push({ pad: "suipump", coinType: coin, symbol: String(e.contents.json["symbol"] ?? ""), name: String(e.contents.json["name"] ?? ""), createdMs: Date.parse(e.timestamp), ts: e.timestamp });
  }
  return out;
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
  const say = (chat_id: number, text: string) => token ? fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id, text: text.slice(0, 4000), disable_web_page_preview: true }) }) : null;
  for (const l of launches.filter((x) => x.createdMs > since)) {
    for (const r of rules) {
      if (!ruleMatches({ launchpads: r.launchpads, keyword: r.keyword, active: r.active }, l, now)) continue;
      const { data: claim } = await d.from("tg_snipe_fills").insert({ filter_id: r.id, coin_type: l.coinType }).select("id").maybeSingle();
      if (!claim) continue; // already handled
      const { data: fresh } = await d.from("tg_snipe_filters").select("spent, spent_day").eq("id", r.id).single();
      const amt = autoBudget(Number(r.amount), Number(r.daily_cap), fresh?.spent_day ?? null, Number(fresh?.spent ?? 0), today);
      if (!amt) { await d.from("tg_snipe_fills").update({ result: "daily max" }).eq("id", claim.id); await say(r.tg_user_id, `⚡ Auto-snipe skipped $${l.symbol}: daily max ${r.daily_cap} SUI reached.`); continue; }
      const spent = (fresh?.spent_day === today ? Number(fresh.spent) : 0) + amt;
      await d.from("tg_snipe_filters").update({ spent, spent_day: today }).eq("id", r.id);
      const { runTgCommand } = await import("./runCommand.server");
      const out = await runTgCommand(r.tg_user_id, `snipe ${l.coinType} ${amt} sui slippage ${r.slippage}%`, null, { slots: r.slots })
        .then((x) => x.reply).catch((e) => `Failed: ${(e as Error).message}. Nothing was sent unless a transaction link is shown.`);
      await d.from("tg_snipe_fills").update({ result: out.slice(0, 500) }).eq("id", claim.id);
      await say(r.tg_user_id, `⚡ Auto-snipe · $${l.symbol} on ${l.pad === "blast" ? "Blast.fun" : "Suipump"}\n${l.coinType}\n${out}\n\nRule #${r.id.slice(0, 6)} · stop: stopsnipe ${r.id.slice(0, 6)}`);
    }
  }
}

const padName = (p: string[]) => p.map((x) => (x === "blast" ? "Blast.fun" : "Suipump")).join(" + ");

export async function listAutoSnipes(tgUserId: number): Promise<string> {
  const { data } = await (await db()).from("tg_snipe_filters").select("*").eq("tg_user_id", tgUserId).order("created_at");
  if (!data?.length) return "⚡ No auto-snipe rules.\nTry: autosnipe all 2 sui max 10 sui slippage 15%";
  const today = new Date().toISOString().slice(0, 10);
  return `⚡ Auto-snipe rules (${data.length}/${AUTO_MAX_RULES})\n\n${data.map((r) => `#${r.id.slice(0, 6)} ${r.active ? "🟢" : "⏸"} ${padName(r.launchpads)} · ${r.amount} SUI each · ${r.spent_day === today ? r.spent : 0}/${r.daily_cap} SUI today · slip ${r.slippage}%${r.keyword ? ` · "${r.keyword}"` : ""} · ${r.slots.map((s: number) => `w${s}`).join(",")}`).join("\n")}\n\npausesnipe <id|all> · resumesnipe <id|all> · stopsnipe <id|all>`;
}

export async function saveAutoSnipe(tgUserId: number, r: AutoRule, slots: number[]): Promise<string> {
  const d = await db();
  const { count } = await d.from("tg_snipe_filters").select("id", { count: "exact", head: true }).eq("tg_user_id", tgUserId);
  if ((count ?? 0) >= AUTO_MAX_RULES) return `You have ${AUTO_MAX_RULES} rules (the max). Stop one first: stopsnipe <id>`;
  const { data, error } = await d.from("tg_snipe_filters").insert({ tg_user_id: tgUserId, launchpads: r.pads, keyword: r.keyword, amount: Number(r.amount), daily_cap: Number(r.dailyCap), slippage: Number(r.slippage), slots }).select("id").single();
  if (error || !data) return "Couldn't save the rule. Nothing will be bought.";
  return `⚡ Auto-snipe ON (#${data.id.slice(0, 6)})\n${padName(r.pads)} · ${r.amount} SUI per new launch · max ${r.dailyCap} SUI/day · slip ${r.slippage}%${r.keyword ? ` · only "${r.keyword}"` : ""}\nWallets: ${slots.map((s) => `w${s}`).join(", ")}\nStarts with the next launch. Each buy is simulated first; you get a receipt.\nStop: stopsnipe ${data.id.slice(0, 6)}`;
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
  return `⚡ Auto-snipe review\nBuy every new ${padName(r.pads)} launch${r.keyword ? ` whose name/ticker contains "${r.keyword}"` : ""}\n${r.amount} SUI per launch per wallet (${walletCount} selected) · max ${r.dailyCap} SUI/day · slip ${r.slippage}%\nOnly launches under 10 minutes old. Each buy is simulated first and protected by min-output; new launches can still lose value fast.\n\nRuns automatically after you confirm.`;
}
