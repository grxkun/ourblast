// SPDX-License-Identifier: BUSL-1.1
/** Pure helpers for the on-chain transactions view (Mini App Activity + /tx). */
export interface TxChange { symbol: string; amount: number }
export interface TxItem {
  digest: string; wallet: string; slot: number; time: string | null;
  ok: boolean; outgoing: boolean; changes: TxChange[];
}

export function isTxCommand(raw: string): boolean {
  return /^\/?(tx|txs|transactions|activity)(@\w+)?$/i.test(raw.trim());
}

/** Atomic balance change → display amount (keeps sign). */
export function toDisplay(atomic: string, decimals: number): number {
  const neg = atomic.startsWith("-");
  const v = BigInt(neg ? atomic.slice(1) : atomic);
  const d = 10n ** BigInt(decimals);
  const n = Number(v / d) + Number(v % d) / Number(d);
  return neg ? -n : n;
}

const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(Number(n.toPrecision(6))));

export function describeTx(t: TxItem): string {
  if (!t.ok) return "Failed transaction";
  if (!t.changes.length) return t.outgoing ? "Contract call" : "Received object";
  return t.changes.map((c) => `${c.amount > 0 ? "+" : ""}${fmt(c.amount)} ${c.symbol}`).join(" · ");
}

export function formatTxList(items: TxItem[]): string {
  if (!items.length) return "No on-chain transactions yet for your wallets.";
  return ["🧾 Recent transactions", ...items.map((t) => {
    const when = t.time ? new Date(t.time).toISOString().slice(5, 16).replace("T", " ") : "";
    return `${t.ok ? "✅" : "❌"} W${t.slot} ${when} UTC\n${describeTx(t)}\nhttps://suiscan.xyz/mainnet/tx/${t.digest}`;
  })].join("\n\n");
}
