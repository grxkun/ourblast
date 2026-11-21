// SPDX-License-Identifier: BUSL-1.1
import { useState } from "react";
import { ArrowDownUp } from "lucide-react";
import { Button } from "@/components/ui/button";

type Chain = "sol" | "bnb" | "base" | "arbitrum";
const CHAINS: { id: Chain; label: string; asset: string }[] = [
  { id: "sol", label: "Solana", asset: "SOL" },
  { id: "bnb", label: "BNB Chain", asset: "BNB" },
  { id: "base", label: "Base", asset: "ETH" },
  { id: "arbitrum", label: "Arbitrum", asset: "ETH" },
];

/** Builds the same bridge command the bot understands; the bot shows its own review before anything moves. */
export function bridgeCommand(dir: "in" | "out", chain: Chain, amount: string): string {
  const a = amount.trim().toLowerCase();
  if (dir === "out") return `bridge ${a} sui to ${chain === "sol" ? "sol" : chain === "bnb" ? "bnb" : `eth on ${chain}`}`;
  if (chain === "sol") return `bridge ${a} sol to sui`;
  if (chain === "bnb") return `bridge ${a} bnb to sui`;
  return `bridge ${a} eth on ${chain} to sui`;
}

export function BridgeCard({ busy, onRun }: { busy: boolean; onRun: (cmd: string) => void }) {
  const [dir, setDir] = useState<"in" | "out">("in");
  const [chain, setChain] = useState<Chain>("sol");
  const [amount, setAmount] = useState("");
  const c = CHAINS.find((x) => x.id === chain)!;
  const from = dir === "in" ? c.asset : "SUI";
  const ok = amount.trim().toLowerCase() === "all" || Number(amount) > 0;
  const presets = dir === "in" ? (c.asset === "SOL" ? ["0.1", "0.5", "1"] : c.asset === "BNB" ? ["0.05", "0.1", "0.5"] : ["0.01", "0.05", "0.1"]) : ["5", "10", "50"];
  return <section className="space-y-3 rounded-xl border border-border bg-surface/50 p-3">
    <div className="flex items-center justify-between">
      <h2 className="font-display text-base uppercase">🌉 Bridge</h2>
      <button disabled={busy} onClick={() => onRun("bridges")} className="text-xs font-bold text-cyber underline">History</button>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Button variant={dir === "in" ? "default" : "outline"} onClick={() => { setDir("in"); setAmount(""); }}>Into Sui</Button>
      <Button variant={dir === "out" ? "default" : "outline"} onClick={() => { setDir("out"); setAmount(""); }}>Out of Sui</Button>
    </div>
    <div className="grid grid-cols-2 gap-2">{CHAINS.map((x) => <Button key={x.id} size="sm" variant={chain === x.id ? "default" : "outline"} onClick={() => { setChain(x.id); setAmount(""); }}>{x.label}</Button>)}</div>
    <p className="flex items-center gap-2 text-sm"><b>{from}</b><ArrowDownUp className="size-4 text-muted-foreground" /><b>{dir === "in" ? "SUI" : c.asset}</b><span className="text-xs text-muted-foreground">· {c.label}</span></p>
    <input aria-label="Bridge amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Amount in ${from}`} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
    <div className="flex flex-wrap gap-2">{[...presets, "all"].map((p) => <button key={p} onClick={() => setAmount(p)} className="rounded-full bg-surface px-3 py-1 text-xs font-bold text-muted-foreground">{p === "all" ? "MAX" : p}</button>)}</div>
    <p className="text-xs text-muted-foreground">{dir === "in" ? `Send ${c.asset} to your ${chain === "sol" ? "Solana" : "EVM"} deposit address (Wallet tab) first.` : "MAX keeps SUI for gas."} You'll get a review before anything moves.</p>
    <Button className="w-full" disabled={busy || !ok} onClick={() => onRun(bridgeCommand(dir, chain, amount))}>Review bridge</Button>
  </section>;
}
