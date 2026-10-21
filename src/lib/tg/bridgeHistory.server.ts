// SPDX-License-Identifier: BUSL-1.1
/** Read-only history of every bridge into or out of Sui for one X-linked account. */

export type BridgeItem = {
  id: string;
  dir: "in" | "out";
  label: string;
  state: "pending" | "done" | "failed";
  detail: string;
  createdAt: string;
  links: { text: string; href: string }[];
};

const OUT_TARGET: Record<string, string> = { SOL: "SOL", BNB: "BNB", ETH_BASE: "ETH (Base)", ETH_ARB: "ETH (Arbitrum)", ETH_RH: "ETH (Robinhood)" };
const EVM_EXPLORER: Record<string, string> = { bsc: "https://bscscan.com/tx/", base: "https://basescan.org/tx/", arbitrum: "https://arbiscan.io/tx/", ethereum: "https://etherscan.io/tx/" };
const EVM_DEC: Record<string, number> = { ETH: 18, BNB: 18, USDC: 6, USDT: 6 };

function stateOf(s: string): BridgeItem["state"] {
  if (/fail|error|refund|expired|cancel/i.test(s)) return "failed";
  if (/done|complete|bridged|hopped|filled|launched|success/i.test(s)) return "done";
  return "pending";
}

export async function bridgeHistory(handle: string, limit = 15): Promise<BridgeItem[]> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const h = handle.toLowerCase();
  const [sol, evm, out] = await Promise.all([
    db.from("sol_sweeps").select("*").ilike("x_username", h).order("created_at", { ascending: false }).limit(limit),
    db.from("evm_sweeps").select("*").ilike("x_username", h).order("created_at", { ascending: false }).limit(limit),
    db.from("sui_out_hops").select("*").ilike("x_username", h).order("created_at", { ascending: false }).limit(limit),
  ]);
  const items: BridgeItem[] = [];
  for (const r of sol.data ?? []) {
    const amt = Number(r.amount_atomic) / (r.token === "SOL" ? 1e9 : 1e6);
    const st = stateOf(r.status);
    items.push({
      id: r.id, dir: "in", label: `${amt} ${r.token} → SUI`, state: st, createdAt: r.created_at,
      detail: st === "failed" ? r.error ?? "Failed — funds stay on Solana." : st === "done" ? "Arrived on Sui" : r.tx_sig ? "Bridging, usually 1–5 min" : "Sending…",
      links: r.tx_sig ? [{ text: "Solscan", href: `https://solscan.io/tx/${r.tx_sig}` }] : [],
    });
  }
  for (const r of evm.data ?? []) {
    const amt = Number(r.amount_atomic) / 10 ** (EVM_DEC[r.token] ?? 18);
    const st = stateOf(r.status);
    const base = EVM_EXPLORER[r.chain] ?? "https://blockscan.com/tx/";
    items.push({
      id: r.id, dir: "in", label: `${Number(amt.toFixed(6))} ${r.token} (${r.chain}) → SUI`, state: st, createdAt: r.created_at,
      detail: st === "failed" ? r.error ?? "Failed — funds stay in your EVM wallet." : st === "done" ? "Arrived on Sui" : r.status === "hopping" ? "Second hop SOL → SUI…" : r.tx_hash ? "Bridging, usually 1–5 min" : "Sending…",
      links: r.tx_hash ? [{ text: "Explorer", href: base + r.tx_hash }] : [],
    });
  }
  for (const r of out.data ?? []) {
    const st = r.status === "done" ? "done" : r.status === "failed" ? "failed" : "pending";
    const links = [
      ...(r.sui_digest ? [{ text: "Suiscan", href: `https://suiscan.xyz/mainnet/tx/${r.sui_digest}` }] : []),
      ...(r.leg2_tx ? [{ text: "Solscan", href: `https://solscan.io/tx/${r.leg2_tx}` }] : []),
    ];
    items.push({
      id: r.id, dir: "out", label: `${r.amount_sui} SUI → ${OUT_TARGET[r.target] ?? r.target}`, state: st, createdAt: r.created_at,
      detail: st === "failed" ? r.error ?? "Failed" : st === "done" ? `Delivered${r.out_formatted ? ` ${r.out_formatted}` : ""}` : r.status === "hopping" ? "Final hop sending…" : r.sui_digest ? "Bridging via Solana…" : "Submitting on Sui…",
      links,
    });
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export function formatBridgeHistory(items: BridgeItem[]): string {
  if (!items.length) return "🌉 No bridges yet.\nTry: bridge 0.05 sol to sui · bridge 10 sui to sol";
  const icon = { pending: "⏳", done: "✅", failed: "❌" } as const;
  return "🌉 Bridge history (newest first)\n\n" + items.map((i) => {
    const when = new Date(i.createdAt).toISOString().slice(5, 16).replace("T", " ");
    return `${icon[i.state]} ${i.dir === "in" ? "⬇️ In" : "⬆️ Out"} · ${i.label}\n   ${i.detail} · ${when} UTC${i.links.map((l) => `\n   ${l.text}: ${l.href}`).join("")}`;
  }).join("\n\n");
}
