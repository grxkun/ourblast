// SPDX-License-Identifier: BUSL-1.1
/** Pure helpers for Telegram dev-wallet alerts (alert only — never trades). */
export const MAX_FOLLOWS = 10;
const SUI = /^0x0*2::sui::SUI$/;

export function parseFollowCommand(text: string): { op: "follow" | "unfollow"; address: string; label?: string } | { op: "list" } | null {
  const t = text.trim();
  if (/^\/?(following|follows)\b/i.test(t)) return { op: "list" };
  const m = t.match(/^\/?(follow|unfollow|track|untrack)(?:@\w+)?\s+(0x[a-fA-F0-9]{1,64})(?:\s+(.{1,24}))?\s*$/);
  if (!m) return null;
  const address = `0x${m[2]!.slice(2).toLowerCase().padStart(64, "0")}`;
  const op = /^un/i.test(m[1]!) ? "unfollow" : "follow";
  return op === "follow" && m[3] ? { op, address, label: m[3].trim() } : { op, address };
}

export type Change = { owner: string | null; coinType: string; amount: string };
const sym = (t: string) => t.split("::").pop() ?? t;
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });

/** Describe a wallet's own tx from its real balance changes. */
export function describeActivity(address: string, changes: Change[], published: string[]): string {
  if (published.length) return `🚀 Published a new package (possible launch)\n${published[0]}`;
  const mine = changes.filter((c) => c.owner === address);
  const sui = mine.filter((c) => SUI.test(c.coinType)).reduce((s, c) => s + Number(c.amount), 0) / 1e9;
  const tokens = mine.filter((c) => !SUI.test(c.coinType));
  const gained = tokens.find((c) => BigInt(c.amount) > 0n);
  const lost = tokens.find((c) => BigInt(c.amount) < 0n);
  if (gained && sui < -0.01) return `🟢 Bought $${sym(gained.coinType)} for ${fmt(-sui)} SUI\n${gained.coinType}`;
  if (lost && sui > 0) return `🔴 Sold $${sym(lost.coinType)} for ${fmt(sui)} SUI\n${lost.coinType}`;
  if (lost) return `📤 Sent $${sym(lost.coinType)}\n${lost.coinType}`;
  if (sui < -0.01) return `📤 Sent ${fmt(-sui)} SUI`;
  if (gained) return `📥 Received $${sym(gained.coinType)}\n${gained.coinType}`;
  return "⚙️ Other on-chain activity";
}
