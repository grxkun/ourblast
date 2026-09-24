import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Landmark } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useBlast } from "@/components/blast/session";
import { supabase } from "@/integrations/supabase/client";
import {
  cancelTransfer,
  confirmTransfer,
  listMyTransfers,
  prepareTransfer,
  transferCoinChoices,
} from "@/lib/terminal/bank.functions";
import { describeRecipient } from "@/lib/terminal/bank";

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: "Awaiting your approval",
  WAITING_RECIPIENT: "Recipient must link a wallet",
  SUBMITTED: "Checking on chain…",
  CONFIRMED: "Sent",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

/** OurBank: tweet "@ourblastbot send 25 SUI to @alice", then approve it here with your own wallet. */
export function OurBankCard() {
  const { userId, ready, signAndExecute } = useBlast();
  const queryClient = useQueryClient();
  const key = ["bank-transfers", userId];

  const list = useServerFn(listMyTransfers);
  const transfers = useQuery({
    queryKey: key,
    queryFn: () => list(),
    enabled: ready && Boolean(userId),
    // Live updates do the real work; this is only a safety net.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  // A tweeted request shows up here the instant the bot saves it.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`ourbank-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bank_transfers", filter: `sender_user_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["bank-transfers", userId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const prepare = useServerFn(prepareTransfer);
  const confirm = useServerFn(confirmTransfer);
  const cancel = useServerFn(cancelTransfer);
  const choices = useServerFn(transferCoinChoices);
  const [picking, setPicking] = useState<{ id: string; coins: { coinType: string; symbol: string }[] } | null>(null);

  const approve = useMutation({
    mutationFn: async ({ id, coinType }: { id: string; coinType?: string }) => {
      const plan = await prepare({ data: { id, coinType } });
      const { digest } = await signAndExecute(async (tx) => {
        const { coinWithBalance } = await import("@mysten/sui/transactions");
        const coin = coinWithBalance({ type: plan.coinType, balance: BigInt(plan.amountAtomic) });
        tx.transferObjects([coin], tx.pure.address(plan.recipient));
      });
      return confirm({ data: { id, digest } });
    },
    onSuccess: (result) => {
      setPicking(null);
      if (result.status === "CONFIRMED") toast.success("Transfer confirmed on chain.");
      else toast(result.message ?? "Submitted — still confirming.");
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Transfer failed.");
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const onApprove = async (row: { id: string; coin_type: string | null }) => {
    if (row.coin_type) return approve.mutate({ id: row.id });
    try {
      const coins = await choices({ data: { id: row.id } });
      if (coins.length === 1) return approve.mutate({ id: row.id, coinType: coins[0]!.coinType });
      setPicking({ id: row.id, coins });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onCancel = async (id: string) => {
    try {
      await cancel({ data: { id } });
      void queryClient.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const rows = transfers.data ?? [];

  return (
    <section id="ourbank" className="border border-border bg-card p-4">
      <h2 className="font-display text-lg uppercase">
        <Landmark className="mr-2 inline size-4" />OurBank
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Tweet <code className="text-foreground">@ourblastbot send 25 SUI to @friend</code> (or to a <code>name.sui</code> or 0x
        address). Any Sui coin works. It appears here, and nothing moves until you approve it with your own wallet.
      </p>

      {!userId ? <p className="mt-3 text-sm text-muted-foreground">Sign in with X and connect your wallet to use OurBank.</p> : null}
      {userId && transfers.isLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading transfers…</p> : null}
      {userId && transfers.data && rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No transfers yet.</p>
      ) : null}

      <ul className="mt-3 space-y-2">
        {rows.map((row) => {
          const open = row.status === "PENDING_APPROVAL";
          return (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border border-border p-3 text-sm">
              <div>
                <p className="font-display">
                  {row.amount_display} {row.symbol} → {describeRecipient(row.recipient_kind as "x", row.recipient_input)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {STATUS_LABEL[row.status] ?? row.status}
                  {row.recipient_address ? ` · ${row.recipient_address.slice(0, 8)}…${row.recipient_address.slice(-6)}` : ""}
                  {row.error ? ` · ${row.error}` : ""}
                </p>
                {row.tx_digest ? (
                  <a className="text-xs text-primary underline" href={`https://suiscan.xyz/mainnet/tx/${row.tx_digest}`} target="_blank" rel="noreferrer">
                    View transaction
                  </a>
                ) : null}
                {picking?.id === row.id ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {picking.coins.map((c) => (
                      <Button key={c.coinType} size="sm" variant="outline" onClick={() => approve.mutate({ id: row.id, coinType: c.coinType })}>
                        {c.symbol} · {c.coinType.slice(0, 10)}…
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex gap-2">
                {open ? (
                  <Button size="sm" disabled={approve.isPending} onClick={() => void onApprove(row)}>
                    {approve.isPending && approve.variables?.id === row.id ? "Approving…" : "Approve"}
                  </Button>
                ) : null}
                {row.status === "SUBMITTED" && row.tx_digest ? (
                  <Button size="sm" variant="outline" onClick={() => confirm({ data: { id: row.id, digest: row.tx_digest! } }).then(() => queryClient.invalidateQueries({ queryKey: key }))}>
                    Re-check
                  </Button>
                ) : null}
                {open || row.status === "WAITING_RECIPIENT" ? (
                  <Button size="sm" variant="ghost" onClick={() => void onCancel(row.id)}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
