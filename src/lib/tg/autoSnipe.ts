// SPDX-License-Identifier: BUSL-1.1
/** Pure helpers for "snipe all launches by filter": rule parsing, matching and daily budget. */
import { MAX_SLIPPAGE, MIN_SLIPPAGE, validSlippage } from "./chatTrade";

export const AUTO_PADS = ["blast", "suipump"] as const;
export type AutoPad = (typeof AUTO_PADS)[number];
export const AUTO_MAX_RULES = 3;
export const AUTO_MAX_PER_SNIPE = 50;
export const AUTO_MAX_DAILY = 500;
/** Only launches seen this fresh are sniped — never old tokens after downtime. */
export const AUTO_MAX_AGE_MS = 10 * 60_000;

export type AutoRule = { pads: AutoPad[]; amount: string; dailyCap: string; slippage: string; keyword: string | null; tp?: string | null; sl?: string | null; minMc?: string; maxMc?: string; minLiq?: string };
export type AutoCommand =
  | ({ op: "start" } & AutoRule)
  | { op: "list" }
  | { op: "stop"; id: string | "all" }
  | { op: "pause" | "resume"; id: string | "all" }
  | { op: "error"; error: string };

export const AUTO_USAGE = "Usage: autosnipe all 2 sui max 10 sui slippage 15%\nLaunchpads: all · blast · suipump\nOptional: keyword pepe (only names/tickers containing it) · tp 100% sl 30% (auto take-profit / stop-loss) · minmc 5k maxmc 20k (USD) · minliq 500 sui (real curve reserve)";

export function parseAutoSnipeCommand(text: string): AutoCommand | null {
  const t = text.trim().replace(/^\//, "").replace(/^(\w+)@\w+/, "$1");
  if (/^(?:autosnipes|snipe\s*rules|snipe\s*filters)$/i.test(t)) return { op: "list" };
  const ctl = t.match(/^(stopsnipe|pausesnipe|resumesnipe)\s+(all|[a-f0-9]{4,36})$/i);
  if (ctl) {
    const op = (ctl[1] ?? "").toLowerCase().replace("snipe", "") as "stop" | "pause" | "resume";
    return { op, id: (ctl[2] ?? "").toLowerCase() };
  }
  if (!/^(?:autosnipe|snipe\s+(?:all|filter))\b/i.test(t)) return null;
  let tp: string | null = null, sl: string | null = null;
  const filters: { minMc?: string; maxMc?: string; minLiq?: string } = {};
  let input = t.replace(/\s+(minmc|maxmc|minliq)\s+(\d*\.?\d+)([km])?\b(?:\s+(?:usdc|usd|sui)\b)?/gi, (_, key: string, v: string, unit: string) => {
    const n = Number(v) * (unit?.toLowerCase() === "k" ? 1000 : unit?.toLowerCase() === "m" ? 1000000 : 1);
    const field = key.toLowerCase() === "minmc" ? "minMc" : key.toLowerCase() === "maxmc" ? "maxMc" : "minLiq";
    filters[field] = String(n); return "";
  });
  if (Object.values(filters).some((v) => !(Number(v) > 0) || !Number.isFinite(Number(v)))) return { op: "error", error: "MC / reserve filters must be above zero." };
  if (filters.minMc && filters.maxMc && Number(filters.minMc) > Number(filters.maxMc)) return { op: "error", error: "Min MC cannot exceed Max MC." };
  const t2 = input.replace(/\s+tp\s+(\d*\.?\d+)\s*%?/i, (_, v) => { tp = v; return ""; }).replace(/\s+sl\s+(\d*\.?\d+)\s*%?/i, (_, v) => { sl = v; return ""; });
  const body = t2.replace(/^(?:autosnipe|snipe\s+filter|snipe\s+all\s+launches)\s*/i, "").replace(/^snipe\s+all\s*/i, "all ");
  const m = body.match(/^(all|blast(?:\.fun)?|suipump)(?:\s*,\s*(blast(?:\.fun)?|suipump))?\s+(\d*\.?\d+)\s*(?:sui)?(?:\s+max\s+(\d*\.?\d+)\s*(?:sui)?(?:\s*\/\s*day)?)?(?:\s+slip(?:page)?\s+(\d*\.?\d+)\s*%?)?(?:\s+keyword\s+([a-z0-9]{2,16}))?\s*$/i);
  if (!m) return body ? { op: "error", error: AUTO_USAGE } : { op: "list" };
  const norm = (p: string) => (p.toLowerCase().startsWith("blast") ? "blast" : "suipump") as AutoPad;
  const pads: AutoPad[] = (m[1] ?? "").toLowerCase() === "all" ? [...AUTO_PADS] : [...new Set([norm((m[1] ?? "")), ...(m[2] ? [norm(m[2])] : [])])];
  const amount = (m[3] ?? "");
  const dailyCap = m[4] ?? String(Math.min(Number(amount) * 5, AUTO_MAX_DAILY));
  const slippage = m[5] ?? "15";
  if (!(Number(amount) > 0) || Number(amount) > AUTO_MAX_PER_SNIPE) return { op: "error", error: `Amount per launch must be between 0 and ${AUTO_MAX_PER_SNIPE} SUI.` };
  if (Number(dailyCap) < Number(amount) || Number(dailyCap) > AUTO_MAX_DAILY) return { op: "error", error: `Daily max must be at least the per-launch amount and at most ${AUTO_MAX_DAILY} SUI.` };
  if (!validSlippage(Number(slippage))) return { op: "error", error: `Slippage must be between ${MIN_SLIPPAGE}% and ${MAX_SLIPPAGE}%.` };
  if (tp != null && !(Number(tp) > 0 && Number(tp) <= 10000)) return { op: "error", error: "Take-profit must be 1–10000%." };
  if (sl != null && !(Number(sl) > 0 && Number(sl) < 100)) return { op: "error", error: "Stop-loss must be between 1% and 99%." };
  return { op: "start", pads, amount, dailyCap, slippage, keyword: m[6]?.toLowerCase() ?? null, ...(tp ? { tp } : {}), ...(sl ? { sl } : {}), ...filters };
}

/** Canonical line carried in the confirm card (callback data can't hold it). */
export function autoLine(r: AutoRule): string {
  const pads = r.pads.length === AUTO_PADS.length ? "all" : r.pads.join(",");
  return `autosnipe ${pads} ${r.amount} sui max ${r.dailyCap} sui slippage ${r.slippage}%${r.keyword ? ` keyword ${r.keyword}` : ""}${r.tp ? ` tp ${r.tp}%` : ""}${r.sl ? ` sl ${r.sl}%` : ""}${r.minMc ? ` minmc ${r.minMc} usd` : ""}${r.maxMc ? ` maxmc ${r.maxMc} usd` : ""}${r.minLiq ? ` minliq ${r.minLiq} sui` : ""}`;
}

/** Quick-exit buttons under a snipe receipt; contract stays in the message text (callback data is 64 bytes). */
export function snipeExitKeyboard(coinType: string) {
  const sym = (coinType.split("::").pop() ?? "TOKEN").toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 16) || "TOKEN";
  return [
    [25, 50, 75, 100].map((n) => ({ text: `🔴 ${n}%`, callback_data: `g|s|${n}|${sym}` })),
    [{ text: "💰 Take initial", callback_data: "ti" }, { text: "🎯 TP +100% / SL −30%", callback_data: "tsl" }],
    [{ text: "📈 Trail 15%", callback_data: "tr|15" }, { text: "📈 Trail 25%", callback_data: "tr|25" }, { text: "📊 Holdings", callback_data: "m:positions" }],
  ];
}

export type FreshLaunch = { pad: AutoPad; coinType: string; symbol: string; name: string; createdMs: number };

export function ruleMatches(rule: { launchpads: string[]; keyword: string | null; active: boolean }, l: FreshLaunch, nowMs: number): boolean {
  if (!rule.active || !rule.launchpads.includes(l.pad)) return false;
  if (nowMs - l.createdMs > AUTO_MAX_AGE_MS) return false;
  if (rule.keyword && !`${l.symbol} ${l.name}`.toLowerCase().includes(rule.keyword)) return false;
  return true;
}

/** SUI the rule may spend now; 0 = daily max reached. */
export function autoBudget(amount: number, dailyCap: number, spentDay: string | null, spent: number, today: string): number {
  const used = spentDay === today ? spent : 0;
  return used + amount <= dailyCap + 1e-9 ? amount : 0;
}

/** Unknown metrics fail closed when a user has set a threshold. Reserve excludes virtual liquidity. */
export function marketFilterMatches(rule: { min_mcap_usd?: number | null; max_mcap_usd?: number | null; min_reserve_sui?: number | null }, mcap: number | null, reserveSui: number | null): boolean {
  if (rule.min_mcap_usd != null && (mcap == null || !Number.isFinite(mcap) || mcap < rule.min_mcap_usd)) return false;
  if (rule.max_mcap_usd != null && (mcap == null || !Number.isFinite(mcap) || mcap > rule.max_mcap_usd)) return false;
  if (rule.min_reserve_sui != null && (reserveSui == null || !Number.isFinite(reserveSui) || reserveSui < rule.min_reserve_sui)) return false;
  return true;
}
export function marketFilterLabel(r: AutoRule): string {
  return [r.minMc ? `Min MC $${r.minMc}` : "", r.maxMc ? `Max MC $${r.maxMc}` : "", r.minLiq ? `Min real reserve ${r.minLiq} SUI` : ""].filter(Boolean).join(" · ");
}
