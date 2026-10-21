// SPDX-License-Identifier: BUSL-1.1
// Telegram presale commands. Pure: parsing and callback payloads only.

export const PRESALE_MAX_SUI = 1000;
const ID = /0x[0-9a-fA-F]{1,64}/;

export type PresaleCommand =
  | { kind: "list" }
  | { kind: "view"; id: string }
  | { kind: "commit"; id: string; amount: string }
  | { kind: "error"; error: string };

const USAGE = "Usage: presales · presale 0x<presaleId> · commit 5 sui to 0x<presaleId>";

/** "presales" | "presale 0x…" | "commit 5 sui to 0x…" | "presale 0x… 5 sui". */
export function parsePresaleCommand(text: string): PresaleCommand | null {
  const t = text.trim().replace(/^\/(presales?|commit)(?:@\w+)?/i, "$1").replace(/\s+/g, " ");
  if (/^presales?$/i.test(t)) return { kind: "list" };
  let m = t.match(/^commit (\d*\.?\d+) ?(?:sui)? (?:to|into|on) (\S+)$/i) ?? null;
  let id: string | undefined;
  let amount: string | undefined;
  if (m) [, amount, id] = m;
  else {
    m = t.match(/^presale (\S+)(?: (\d*\.?\d+) ?(?:sui)?)?$/i);
    if (!m) return /^(presale|commit)\b/i.test(t) ? { kind: "error", error: USAGE } : null;
    [, id, amount] = m;
  }
  if (!id || !new RegExp(`^${ID.source}$`).test(id)) return { kind: "error", error: `Presales need the sale's object ID (0x…).\n${USAGE}` };
  const norm = "0x" + id.slice(2).toLowerCase().padStart(64, "0");
  if (amount === undefined) return { kind: "view", id: norm };
  const n = Number(amount);
  if (!(n > 0) || n > PRESALE_MAX_SUI) return { kind: "error", error: `Amount must be between 0 and ${PRESALE_MAX_SUI} SUI.` };
  return { kind: "commit", id: norm, amount };
}

/** Callback payload: "pc|<amount>" or "pg|<amount>" (ask / go). The presale ID rides in the message text. */
export function encodePresaleAction(kind: "ask" | "go", amount: string): string {
  return `${kind === "ask" ? "pc" : "pg"}|${amount}`;
}

export function decodePresaleAction(data: string): { kind: "ask" | "go"; amount: string } | null {
  const m = data.match(/^(pc|pg)\|(\d*\.?\d+)$/);
  if (!m) return null;
  const n = Number(m[2]);
  if (!(n > 0) || n > PRESALE_MAX_SUI) return null;
  return { kind: m[1] === "pc" ? "ask" : "go", amount: m[2]! };
}

/** Reads the presale ID the bot wrote into its own message ("Presale: 0x…"). */
export function presaleIdFromText(text: string): string | null {
  return text.match(/Presale: (0x[0-9a-f]{64})/)?.[1] ?? null;
}

/** "0xPKG::blast_presale::Presale<MEME, QUOTE>" → parts, or null for any other type. */
export function parsePresaleType(type: string): { pkg: string; memeType: string; quoteType: string } | null {
  const m = type.match(/^(0x[0-9a-f]+)::blast_presale::Presale<(.+)>$/);
  if (!m) return null;
  let depth = 0;
  const inner = m[2]!;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "<") depth++;
    else if (c === ">") depth--;
    else if (c === "," && depth === 0) return { pkg: m[1]!, memeType: inner.slice(0, i).trim(), quoteType: inner.slice(i + 1).trim() };
  }
  return null;
}

/** SUI amount string → MIST (9 decimals), exact. */
export function suiToMist(amount: string): bigint {
  const [w = "0", f = ""] = amount.split(".");
  return BigInt(w || "0") * 1_000_000_000n + BigInt((f + "000000000").slice(0, 9));
}
