// SPDX-License-Identifier: BUSL-1.1
/** Group token scanner: pure helpers (no wallet access — groups never touch anyone's funds). */
import { mainToken } from "@/lib/terminal/mainTokens";

const CT_ANY = /0x[a-f0-9]{1,64}::[a-z_][a-z0-9_]*::[a-z_][a-z0-9_]*/i;
export const BOT_USERNAME = "ourblastsuibot";

/** Finds a token in a group message: /scan <ca|$TICKER>, or a coin type pasted anywhere. */
export function findScanTarget(text: string): { symbol: string; coinType: string } | null {
  const t = text.trim();
  const scan = t.match(/^\/scan(?:@\w+)?\s+(\S+)/i);
  const raw = scan?.[1] ?? t.match(CT_ANY)?.[0] ?? null;
  if (!raw) return null;
  const ct = raw.match(CT_ANY)?.[0];
  if (ct) return { symbol: ct.split("::")[2]!.toUpperCase().slice(0, 16), coinType: ct };
  const tk = raw.replace(/^\$/, "");
  const m = /^[a-z0-9]{1,16}$/i.test(tk) ? mainToken(tk) : null;
  return m?.coinType ? { symbol: tk.toUpperCase(), coinType: m.coinType } : null;
}

/** DM deep link; Telegram start payloads max 64 chars of [A-Za-z0-9_-], so only tickers fit. */
export function buyDeepLink(symbol: string): string {
  const s = symbol.replace(/[^a-z0-9]/gi, "").slice(0, 16);
  return `https://t.me/${BOT_USERNAME}?start=b_${s}`;
}

/** Full-contract DM deep link: c_<base64url 32-byte address><Name>, only when module == lowercase(name) (most Sui coins). */
export function contractDeepLink(coinType: string): string | null {
  const [addr, mod, name] = coinType.split("::");
  if (!addr || !mod || !name || mod !== name.toLowerCase() || !/^[A-Za-z0-9]+$/.test(name)) return null;
  const hex = addr.replace(/^0x/i, "").padStart(64, "0");
  if (!/^[a-f0-9]{64}$/i.test(hex)) return null;
  const b64 = Buffer.from(hex, "hex").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const payload = `c_${b64}${name}`;
  return payload.length <= 64 ? `https://t.me/${BOT_USERNAME}?start=${payload}` : null;
}

export function parseStartContract(text: string): string | null {
  const m = text.match(/^\/start\s+c_([A-Za-z0-9_-]{43})([A-Za-z0-9]{1,19})$/);
  if (!m) return null;
  const hex = Buffer.from(m[1]!.replace(/-/g, "+").replace(/_/g, "/") + "=", "base64").toString("hex");
  if (hex.length !== 64) return null;
  return `0x${hex}::${m[2]!.toLowerCase()}::${m[2]}`;
}

export function parseStartBuy(text: string): string | null {
  return text.match(/^\/start\s+b_([a-z0-9]{1,16})$/i)?.[1]?.toUpperCase() ?? null;
}

export function fmtPrice(p: number | null): string {
  if (p == null || !Number.isFinite(p)) return "n/a";
  if (p >= 1) return `$${p.toFixed(4)}`;
  return `$${p.toPrecision(4)}`;
}

const PAD_LABELS: Record<string, string> = {
  suipump: "Suipump", perpsplexity: "Perpsplexity", maelstrom: "Maelstrom", blastfun: "Blast.fun",
  "blast.fun": "Blast.fun", turbosfun: "TurbosFun", vicefun: "ViceFun", popularsui: "PopularSui",
};
export function launchpadLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return PAD_LABELS[id.toLowerCase()] ?? id;
}

/** Chart links: Sui-native sites only (DexScreener removed — its Sui data was unreliable). */
export function chartButtons(coinType: string): { text: string; url: string }[][] {
  const c = encodeURIComponent(coinType);
  return [
    [{ text: "📈 Noodles", url: `https://noodles.fi/coins/${c}` }, { text: "📈 YOLO", url: `https://yolo.casa/token/${c}` }, { text: "📈 Tavern", url: `https://tavern.family/token/${c}` }],
    [{ text: "Suiscan", url: `https://suiscan.xyz/mainnet/coin/${coinType}` }],
  ];
}

export function scanCard(t: { symbol: string; coinType: string }, price: number | null, launchpad?: string | null): string {
  const pad = launchpadLabel(launchpad);
  return `🔎 $${t.symbol} — OURBLAST scan\nPrice: ${fmtPrice(price)} (Aftermath)${pad ? `\n🚀 Launched on ${pad}` : ""}\n\n${t.coinType}\n\nTap Buy to trade in a private chat — you always confirm first.`;
}

export type ScanStats = {
  priceUsd: number | null; priceSource?: string; mcap: number | null; liquidity: number | null;
  volume24h: number | null; change24h: number | null; dex: string | null; pools: number; launchpad?: string | null;
  /** Real on-chain ticker/name (launchpad templates share struct names like ::suipump::SUIPUMP). */
  symbol?: string | null; name?: string | null;
};

/** Launchpads whose coin template fixes the module name, so the module identifies the pad. */
export function padFromModule(coinType: string): string | null {
  const mod = coinType.split("::")[1]?.toLowerCase();
  return mod === "suipump" ? "suipump" : null;
}

export function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Inline chart/explorer links as short hyperlinked tags (Rick-style), not buttons. */
export function chartLinksHtml(coinType: string): string {
  const c = encodeURIComponent(coinType);
  const l = (u: string, t: string) => `<a href="${esc(u)}">${t}</a>`;
  return [
    l(`https://noodles.fi/coins/${c}`, "NOO"), l(`https://yolo.casa/token/${c}`, "YO"), l(`https://tavern.family/token/${c}`, "TAV"),
    l(`https://suiscan.xyz/mainnet/coin/${coinType}`, "SCAN"),
  ].join(" · ");
}

/** Rick/BasedBot-style card in Telegram HTML (send with parse_mode "HTML"). Missing data shows n/a, never guessed. */
export function richScanCard(t: { symbol: string; coinType: string }, s: ScanStats, mode: "group" | "dm"): string {
  const pad = launchpadLabel(s.launchpad);
  const ch = s.change24h == null ? "" : ` ${s.change24h >= 0 ? "🟢 +" : "🔴 "}${s.change24h.toFixed(1)}%`;
  const liqPct = s.liquidity && s.mcap ? ` [${((s.liquidity / s.mcap) * 100).toFixed(1)}%]` : "";
  const dex = s.dex ? s.dex.charAt(0).toUpperCase() + s.dex.slice(1) : "n/a";
  const lines = [
    `${mode === "group" ? "🔎" : "💥"} <b>$${esc(s.symbol || t.symbol)}</b>${s.name ? ` (${esc(s.name)})` : ""} · Sui${pad ? ` · 🚀 ${esc(pad)}` : ""}`,
    `<code>${esc(t.coinType)}</code>`,
    "",
    `💰 <b>USD:</b> ${fmtPrice(s.priceUsd)}${ch}`,
    `💎 <b>MC:</b> ${fmtUsd(s.mcap)}`,
    ...(s.liquidity != null ? [`💧 <b>Liq:</b> ${fmtUsd(s.liquidity)}${liqPct}`] : []),
    ...(s.volume24h != null ? [`📊 <b>Vol:</b> ${fmtUsd(s.volume24h)} (24h)`] : []),
    `🏦 <b>DEX:</b> ${esc(dex)}${s.pools > 1 ? ` · ${s.pools} pools` : ""}${s.priceSource ? ` · via ${esc(s.priceSource)}` : ""}`,
    "",
    `📈 ${chartLinksHtml(t.coinType)}`,
    "",
    mode === "group" ? "<i>Tap Buy — opens your private chat. You always confirm first.</i>" : "<i>Pick an amount — you'll confirm before anything moves.</i>",
  ];
  return lines.join("\n");
}

export const SLIP_PRESETS = ["5", "10", "15", "25"];
export const DEFAULT_DECK_SLIP = "10";
type Btn = { text: string; callback_data?: string; url?: string; web_app?: { url: string } };

/** Private-chat trading deck: wallet toggles (tw|slot|slip), slippage picks (ts|slip), and buy/sell presets carrying the chosen slippage. */
export function deckKeyboard(o: {
  symbol: string; slots: number[]; selected: number[]; slip: string;
  encode: (side: "buy" | "sell", amount: string, slip: string) => string;
}): Btn[][] {
  const sel = new Set(o.selected);
  const walletRow = o.slots.map((s) => ({ text: `${sel.has(s) ? "✅ " : ""}W${s}`, callback_data: `tw|${s}|${o.slip}` }));
  return [
    ["1", "5", "10", "25"].map((a) => ({ text: `Buy ${a} SUI`, callback_data: o.encode("buy", a, o.slip) })),
    ["25", "50", "100"].map((a) => ({ text: a === "100" ? "Sell MAX" : `Sell ${a}%`, callback_data: o.encode("sell", a, o.slip) })),
    [{ text: "✏️ Buy X SUI", callback_data: `cx|b|${o.slip}` }, { text: "✏️ Sell X%", callback_data: `cx|s|${o.slip}` }, { text: "📊 Position", callback_data: "pp" }],
    SLIP_PRESETS.map((p) => ({ text: `${p === o.slip ? "✅ " : ""}Slip ${p}%`, callback_data: `ts|${p}` })),
    ...(walletRow.length > 1 ? [walletRow] : []),
  ];
}

export function parseDeckTap(data: string): { kind: "wallet"; slot: number; slip: string } | { kind: "slip"; slip: string } | null {
  const w = data.match(/^tw\|([1-9])\|(\d{1,2})$/);
  if (w && SLIP_PRESETS.includes(w[2]!)) return { kind: "wallet", slot: Number(w[1]), slip: w[2]! };
  const s = data.match(/^ts\|(\d{1,2})$/);
  if (s && SLIP_PRESETS.includes(s[1]!)) return { kind: "slip", slip: s[1]! };
  return null;
}

/** Toggle a wallet; never leaves zero wallets selected. */
export function toggleSlot(selected: number[], slot: number): number[] {
  const next = selected.includes(slot) ? selected.filter((s) => s !== slot) : [...selected, slot].sort();
  return next.length ? next : selected;
}
