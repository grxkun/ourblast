// SPDX-License-Identifier: BUSL-1.1
/** PnL card background presets + /pnlbg parsing. Pure — no I/O. */
import cool from "@/assets/blast-cool.png.asset.json";
import laughing from "@/assets/blast-laughing.png.asset.json";
import logo from "@/assets/blast-logo.jpg.asset.json";
import hero from "@/assets/hero-gallery.jpg.asset.json";
import coin from "@/assets/mascot-coin.jpg.asset.json";

const ORIGIN = "https://ourblast.xyz";
export const PNL_PRESETS: Record<string, { label: string; url: string }> = {
  blast: { label: "🔥 Blast", url: ORIGIN + logo.url },
  cool: { label: "😎 Cool", url: ORIGIN + cool.url },
  laugh: { label: "😂 Laugh", url: ORIGIN + laughing.url },
  coin: { label: "🪙 Coin", url: ORIGIN + coin.url },
  city: { label: "🌃 City", url: ORIGIN + hero.url },
};
export const DEFAULT_PNL_BG = "blast";

/** Stored value (preset key or https URL) → photo URL. Unknown values fall back to the default preset. */
export function resolvePnlBg(stored: string | null | undefined): string {
  if (stored && /^https:\/\/\S{8,500}$/i.test(stored)) return stored;
  return (PNL_PRESETS[stored ?? ""] ?? PNL_PRESETS[DEFAULT_PNL_BG]!).url;
}

export type PnlBgCmd = { set: string } | { reset: true } | { menu: true };
/** "/pnlbg", "/pnlbg cool", "/pnlbg https://…", "/pnlbg reset". */
export function parsePnlBg(text: string): PnlBgCmd | null {
  const m = text.trim().match(/^\/(?:pnlbg|settings)(?:@\w+)?(?:\s+(\S+))?\s*$/i);
  if (!m) return null;
  const arg = m[1];
  if (!arg) return { menu: true };
  if (/^(reset|default)$/i.test(arg)) return { reset: true };
  if (PNL_PRESETS[arg.toLowerCase()]) return { set: arg.toLowerCase() };
  if (/^https:\/\/\S{8,500}$/i.test(arg)) return { set: arg };
  return { menu: true };
}

export function pnlBgKeyboard(): { text: string; callback_data: string }[][] {
  const keys = Object.keys(PNL_PRESETS);
  const rows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < keys.length; i += 3) rows.push(keys.slice(i, i + 3).map((k) => ({ text: PNL_PRESETS[k]!.label, callback_data: `pbg:${k}` })));
  return rows;
}
export const PNL_BG_HELP = "🎨 PnL card background\nPick a preset below, or send:\n/pnlbg https://your-image.jpg — your own picture (https link)\n/pnlbg reset — back to default";
