// SPDX-License-Identifier: BUSL-1.1
import { canonicalCoin } from "./market";
import { BOT_USERNAME, contractDeepLink, richScanCard, type ScanStats } from "./scanner";
import type { FreshLaunch } from "./autoSnipe";

export const NOTIFIER_CHANNEL = "@ourblastnotifier";
export function notifierEligible(l: FreshLaunch, startedMs: number, now: number) {
  return !!canonicalCoin(l.coinType) && Number.isFinite(l.createdMs) && l.createdMs >= startedMs && l.createdMs <= now && now - l.createdMs <= 600_000;
}
export function publicUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  const raw = value.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${value.slice(7)}` : value;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".") || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(u.hostname)) return null;
    return u.href;
  } catch { return null; }
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function notifierSocials(description: string, fields: Record<string, unknown> = {}) {
  const values = [fields["website"], fields["twitter"], fields["telegram"], fields["website_url"], fields["twitter_url"], fields["telegram_url"], ...(description.match(/https:\/\/[^\s<>"']+/g) ?? [])];
  const found = new Map<string, string>();
  for (const v of values) {
    const url = publicUrl(v);
    if (!url) continue;
    const host = new URL(url).hostname.replace(/^www\./, "");
    const label = host === "x.com" || host === "twitter.com" ? "X" : host === "t.me" || host === "telegram.me" ? "TG" : "WEB";
    if (!found.has(label)) found.set(label, url);
  }
  return [...found].map(([label, url]) => `<a href="${esc(url)}">${label}</a>`).join(" · ");
}
export function notifierPost(l: Pick<FreshLaunch, "coinType" | "symbol" | "pad">, stats: ScanStats, socials: string) {
  const text = richScanCard(l, { ...stats, launchpad: stats.launchpad ?? (l.pad === "blast" ? "blast.fun" : "suipump") }, "group");
  return {
    text: `${text}${socials ? `\n🌐 ${socials}` : "\n🌐 Socials: unavailable"}`,
    photoCaption: `🚀 <b>$${esc((stats.symbol || l.symbol).slice(0, 40))}</b> · ${l.pad === "blast" ? "Blast.fun" : "Suipump"}\n<code>${esc(l.coinType)}</code>`,
    reply_markup: { inline_keyboard: [[{ text: "Buy in Private Chat", url: contractDeepLink(l.coinType) ?? `https://t.me/${BOT_USERNAME}` }, { text: "Open Mini App", url: `https://t.me/${BOT_USERNAME}?startapp` }]] },
  };
}