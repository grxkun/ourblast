import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity } from "lucide-react";
import { listSwapAttemptsAdmin } from "@/lib/admin.functions";
import { timeAgo } from "@/lib/blast";

const short = (t: string) => (t.length > 24 ? `${t.slice(0, 8)}…${t.split("::").slice(1).join("::") || t.slice(-6)}` : t);

export function SwapAttemptsCard() {
  const fetchList = useServerFn(listSwapAttemptsAdmin);
  const q = useQuery({ queryKey: ["swap-attempts"], queryFn: () => fetchList({}), refetchInterval: 20_000 });
  return (
    <div className="panel mt-4 space-y-3 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm font-bold uppercase tracking-wide">Transaction status</h3>
      </div>
      <p className="font-body text-xs text-muted-foreground">Every swap attempt, its error, transaction and what the blockchain says right now.</p>
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !q.data?.length ? (
        <p className="text-sm text-muted-foreground">No swap attempts yet.</p>
      ) : (
        <ul className="space-y-2">
          {q.data.map((r) => {
            const ok = r.chain.state === "CONFIRMED";
            const bad = r.status === "FAILED" || r.chain.state === "CHAIN FAILED";
            return (
              <li key={r.id} className="rounded-md border border-border p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
                  <a className="underline" href={`https://x.com/i/status/${r.x_post_id}`} target="_blank" rel="noreferrer">@{r.x_username} · {timeAgo(r.created_at)}</a>
                  <span>
                    <span className={bad ? "text-destructive" : ""}>{r.status}</span> ·{" "}
                    <span className={ok ? "text-primary" : r.chain.state === "CHAIN FAILED" ? "text-destructive" : ""}>{r.chain.state}</span>
                  </span>
                </div>
                <p className="mt-1 font-body text-sm">{r.side.toUpperCase()} {r.amount_in} {short(r.coin_in)} → {short(r.coin_out)}{r.quoted_out ? ` (quote ${r.quoted_out})` : ""}</p>
                {r.tx_digest ? (
                  <a className="mt-1 block break-all text-primary underline" href={`https://suiscan.xyz/mainnet/tx/${r.tx_digest}`} target="_blank" rel="noreferrer">{r.tx_digest}</a>
                ) : <p className="mt-1 text-muted-foreground">No transaction sent</p>}
                {r.error && <p className="mt-1 break-all text-destructive">Error: {r.error}</p>}
                {r.chain.error && <p className="mt-1 break-all text-destructive">Chain: {r.chain.error}</p>}
                <p className="mt-1 text-muted-foreground">Updated {timeAgo(r.updated_at)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
