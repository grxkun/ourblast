import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cancelOwnSwap, getTradeWallet, listMyPendingSwaps, setTradeWallet } from "@/lib/terminal/bank.functions";
import { shortCoinType } from "@/lib/terminal/bank";

import { useBankApprovals } from "./useBankApprovals";

const OPTIONS = [
  { id: "ourbank", label: "OurBank wallet", hint: "Instant — the bot sends and trades for you." },
  { id: "own", label: "My own wallet", hint: "You approve every send, buy and sell here." },
] as const;

/** One saved choice used by X mentions and terminal chat alike. */
export function TradeWalletPanel({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const fetchPref = useServerFn(getTradeWallet);
  const savePref = useServerFn(setTradeWallet);
  const listSwaps = useServerFn(listMyPendingSwaps);
  const cancel = useServerFn(cancelOwnSwap);
  const { approveSwap } = useBankApprovals();

  const pref = useQuery({ queryKey: ["trade-wallet", userId], queryFn: () => fetchPref() });
  const swaps = useQuery({ queryKey: ["own-swaps", userId], queryFn: () => listSwaps(), refetchInterval: 15_000 });

  const change = useMutation({
    mutationFn: (tradeWallet: "ourbank" | "own") => savePref({ data: { tradeWallet } }),
    onSuccess: (r) => {
      toast.success(r.tradeWallet === "own" ? "Using your own wallet — approve each trade here." : "Using your OurBank wallet — trades run instantly.");
      void queryClient.invalidateQueries({ queryKey: ["trade-wallet", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: (id: string) => approveSwap(id),
    onSuccess: (r) => {
      if (r.status === "CONFIRMED") toast.success(`Trade confirmed via ${r.venue}.`);
      else toast(r.message ?? "Submitted — still confirming.");
      void queryClient.invalidateQueries({ queryKey: ["own-swaps", userId] });
    },
    onError: (e: Error) => {
      toast.error(e.message || "Trade failed.");
      void queryClient.invalidateQueries({ queryKey: ["own-swaps", userId] });
    },
  });

  const current = pref.data?.tradeWallet ?? "ourbank";
  const pending = (swaps.data ?? []).filter((s) => s.status === "PENDING_APPROVAL" || s.status === "SUBMITTED");

  return (
    <div className="mt-4 border border-border p-3">
      <p className="font-body text-xs font-bold uppercase text-primary">Trade wallet</p>
      <p className="mt-1 text-xs text-muted-foreground">Used for send, buy and sell — from X mentions and from the terminal chat.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={change.isPending || pref.isLoading}
            onClick={() => o.id !== current && change.mutate(o.id)}
            aria-pressed={current === o.id}
            className={`border p-2 text-left text-sm transition-colors ${current === o.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
          >
            <span className="font-bold">{o.label}</span>
            <span className="block text-xs text-muted-foreground">{o.hint}</span>
          </button>
        ))}
      </div>

      {pending.length ? (
        <ul className="mt-3 space-y-2">
          {pending.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 border border-border p-2 text-sm">
              <span>
                <span className="font-bold uppercase">{s.side}</span>{" "}
                {s.side === "buy" ? `${Number(s.amount_in) / 1e9} SUI → ${shortCoinType(s.coin_out)}` : `${shortCoinType(s.coin_in)} → SUI`}
                {s.x_post_id.startsWith("terminal-") ? " · terminal" : " · from X"}
              </span>
              {s.status === "PENDING_APPROVAL" ? (
                <span className="flex gap-2">
                  <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate(s.id)}>
                    {approve.isPending && approve.variables === s.id ? "Signing…" : "Approve"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try { await cancel({ data: { id: s.id } }); } catch (e) { toast.error((e as Error).message); }
                      void queryClient.invalidateQueries({ queryKey: ["own-swaps", userId] });
                    }}
                  >
                    Cancel
                  </Button>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Confirming…</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
