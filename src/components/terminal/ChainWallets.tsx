// SPDX-License-Identifier: BUSL-1.1
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { exportChainKey, getChainBalances, getDepositAction, setDepositAction } from "@/lib/terminal/chain-wallets.functions";

export function useChainBalances(userId: string) {
  const get = useServerFn(getChainBalances);
  return useQuery({ queryKey: ["chain-balances", userId], queryFn: () => get(), refetchInterval: 60_000 });
}

/** One-line summary of the EVM/Solana deposit balances. */
export function evmSummary(b: ReturnType<typeof useChainBalances>["data"]) {
  const parts = (b?.evm ?? []).flatMap((c) => [
    c.eth > 0 ? `${c.eth.toFixed(5)} ${c.native ?? "ETH"} (${c.chain === "bsc" ? "BNB Chain" : c.chain})` : null,
    c.usdc ? `${c.usdc.toFixed(2)} USDC (${c.chain})` : null,
  ]).filter(Boolean);
  return b ? (parts.length ? parts.join(" · ") : "empty") : "…";
}
export function solSummary(b: ReturnType<typeof useChainBalances>["data"]) {
  if (!b) return "…";
  if (!b.sol) return "empty";
  const p = [b.sol.sol > 0 ? `${b.sol.sol.toFixed(4)} SOL` : null, b.sol.usdc > 0 ? `${b.sol.usdc.toFixed(2)} USDC` : null].filter(Boolean);
  return p.length ? p.join(" · ") : "empty";
}

/** Lets the user pick: bridged deposits auto-buy $BLAST, or stay as SUI. */
export function DepositActionToggle({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const get = useServerFn(getDepositAction);
  const set = useServerFn(setDepositAction);
  const q = useQuery({ queryKey: ["deposit-action", userId], queryFn: () => get() });
  const m = useMutation({
    mutationFn: (v: "buy_blast" | "keep_sui") => set({ data: { depositAction: v } }),
    onSuccess: (r) => { toast.success(r.depositAction === "keep_sui" ? "Deposits will stay as SUI." : "Deposits will auto-buy $BLAST."); void qc.invalidateQueries({ queryKey: ["deposit-action", userId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const cur = q.data?.depositAction;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground">EVM / Solana deposits:</span>
      {(["buy_blast", "keep_sui"] as const).map((v) => (
        <Button key={v} size="sm" variant={cur === v ? "default" : "outline"} disabled={m.isPending || !cur} onClick={() => m.mutate(v)}>
          {v === "buy_blast" ? "Auto-buy $BLAST" : "Keep as SUI"}
        </Button>
      ))}
    </div>
  );
}

/** Reveals the EVM or Solana private key for 60 seconds, owner only. */
export function ChainBackupButton({ chain, exportable }: { chain: "evm" | "sol"; exportable: boolean }) {
  const doExport = useServerFn(exportChainKey);
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const m = useMutation({
    mutationFn: () => doExport({ data: { chain } }),
    onSuccess: (r) => { setKey(r.secretKey); setLeft(60); },
    onError: (e: Error) => toast.error(e.message),
  });
  useEffect(() => {
    if (!key) return;
    if (left <= 0) { setKey(null); setAck(false); void navigator.clipboard.writeText("").catch(() => {}); return; }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [key, left]);
  if (!exportable) return <span className="font-display text-xs text-muted-foreground uppercase">Enclave key</span>;
  const label = chain === "evm" ? "MetaMask, Rabby or Rainbow" : "Phantom, Solflare or Backpack";
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => { setOpen(true); setKey(null); setAck(false); }}>Backup</Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4" onClick={() => { setOpen(false); setKey(null); }}>
          <div className="panel w-full max-w-md p-5 text-left text-sm" onClick={(e) => e.stopPropagation()}>
            <p className="font-display uppercase">Back up your {chain === "evm" ? "EVM" : "Solana"} key</p>
            <p className="mt-2 text-muted-foreground">Import this key into {label}. Anyone with it controls this address. Never share it — not even with OURBLAST support.</p>
            {key ? (
              <>
                <p className="mt-3 break-all border border-border p-2 font-mono text-xs">{key}</p>
                <p className="mt-1 text-xs text-muted-foreground">Hides in {left}s.</p>
                <Button className="mt-2" size="sm" onClick={() => { void navigator.clipboard.writeText(key); toast.success("Key copied — clipboard clears when it hides"); }}>Copy key</Button>
              </>
            ) : (
              <>
                <label className="mt-3 flex items-start gap-2 text-xs">
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                  I understand anyone with this key can take the funds.
                </label>
                <Button className="mt-3" size="sm" disabled={!ack || m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Revealing…" : "Reveal key"}</Button>
              </>
            )}
            <Button className="mt-3 ml-2" size="sm" variant="ghost" onClick={() => { setOpen(false); setKey(null); }}>Close</Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
