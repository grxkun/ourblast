import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Copy, Wallet, ArrowDownToLine } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getDevFeeStatus, claimDevFees, getDevShareLedger } from "@/lib/dev-fee.functions";
import { formatSui } from "@/lib/sui-balance";
import { shortAddress } from "@/lib/blast";

export function DevFeeCard() {
  const queryClient = useQueryClient();
  const statusFn = useServerFn(getDevFeeStatus);
  const claimFn = useServerFn(claimDevFees);
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);

  const status = useQuery({
    queryKey: ["dev-fee-status"],
    queryFn: () => statusFn({}),
    staleTime: 30_000,
  });

  const ledgerFn = useServerFn(getDevShareLedger);
  const ledger = useQuery({
    queryKey: ["dev-share-ledger"],
    queryFn: () => ledgerFn({}),
    staleTime: 60_000,
  });

  const claim = useMutation({
    mutationFn: (amountSui: number) => claimFn({ data: { amountSui } }),
    onSuccess: (result) => {
      toast.success(`Sent ${result.amountSui} SUI to your dev wallet`, {
        description: `tx ${shortAddress(result.digest)}`,
      });
      setAmount("");
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: ["dev-fee-status"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Transfer failed.");
      setConfirming(false);
    },
  });

  const data = status.data;

  const handleClaim = () => {
    const amountSui = Number(amount);
    if (!Number.isFinite(amountSui) || amountSui <= 0) {
      toast.error("Enter a valid SUI amount.");
      return;
    }
    if (data && amountSui > data.botBalanceSui) {
      toast.error("Amount exceeds the bot wallet balance.");
      return;
    }
    if (data && data.botBalanceSui - amountSui < 5) {
      toast.error("Leave at least 5 SUI in the bot wallet so launches can still pay gas.");
      return;
    }
    if (!confirming) {
      setConfirming(true);
      return;
    }
    claim.mutate(amountSui);
  };

  return (
    <section className="border border-border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg uppercase">
          <Wallet className="mr-2 inline size-4" />
          Dev fee claim
        </h2>
      </header>

      <p className="mt-2 text-sm text-muted-foreground">
        Creator fees on every new token split 10% @ourblastbot · 10% BLAST buy &amp; burn · 10% dev (you) · 10% treasury
        · 60% launcher. Your 10% (plus 10% of game fees) is paid straight to your dev wallet on chain — nothing of
        yours is waiting here to be claimed.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        The bot wallet balance below is <span className="font-bold">not your share</span>: it is the launch gas float,
        the @ourblastbot ops share and the BLAST buy &amp; burn reserve. Moving it to your dev wallet takes funds out of
        launches and the burn reserve.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Fees only move once someone releases them per token — use the <span className="font-bold">Claim creator fees</span>{" "}
        panel below.
      </p>

      {status.isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading wallet balances…</p>
      ) : data ? (
        <div className="mt-4 space-y-4">
          {/* Dev wallet */}
          <div className="rounded-lg border border-border bg-background/60 p-3">
            <div className="flex items-center justify-between">
              <span className="font-display text-xs uppercase text-muted-foreground">Your dev wallet</span>
              <span className="font-display text-lg text-lime">
                {formatSui(data.devBalanceSui)} SUI
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{data.devWallet}</code>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(data.devWallet);
                  toast.success("Address copied.");
                }}
              >
                <Copy className="size-3" />
              </Button>
            </div>
          </div>

          {/* Bot wallet */}
          <div className="rounded-lg border border-border bg-background/60 p-3">
            <div className="flex items-center justify-between">
              <span className="font-display text-xs uppercase text-muted-foreground">
                Bot wallet — gas, ops &amp; burn reserve (not your share)
              </span>
              <span className="font-display text-lg">
                {formatSui(data.botBalanceSui)} SUI
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{data.botWallet}</code>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(data.botWallet);
                  toast.success("Address copied.");
                }}
              >
                <Copy className="size-3" />
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-border bg-background/60 p-3">
              <p className="font-display text-xs uppercase text-muted-foreground">Game sessions</p>
              <p className="font-display text-xl">{data.gameSessions}</p>
              <p className="text-xs text-muted-foreground">
                ~{data.estimatedDevGameShareSui.toFixed(2)} SUI dev share — already paid on chain
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/60 p-3">
              <p className="font-display text-xs uppercase text-muted-foreground">Tokens deployed</p>
              <p className="font-display text-xl">{data.launchesDeployed}</p>
              <p className="text-xs text-muted-foreground">creator fees auto-paid on-chain</p>
            </div>
          </div>

          {/* On-chain per-token dev share */}
          <div className="rounded-lg border border-border bg-background/60 p-3">
            <p className="font-display text-xs uppercase text-muted-foreground">
              Your share, read from chain
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Each launch writes its fee recipients permanently into the token. This is what every deployed token
              actually pays you on trading volume.
            </p>
            {ledger.isLoading ? (
              <p className="mt-3 text-xs text-muted-foreground">Reading launch transactions…</p>
            ) : ledger.data && ledger.data.length > 0 ? (
              <ul className="mt-3 divide-y divide-border">
                {ledger.data.map((row) => (
                  <li key={row.digest} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                    <span className="font-bold">${row.symbol}</span>
                    <span className="text-xs text-muted-foreground">{row.launchpad}</span>
                    <span className={row.devBps ? "font-display text-lime" : "text-xs text-muted-foreground"}>
                      {row.devBps ? `${row.devBps / 100}% of creator fees to you` : (row.note ?? "no dev share")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                {ledger.error?.message ?? "No deployed launches yet."}
              </p>
            )}
          </div>

          {/* Claim form */}
          <div className="rounded-lg border border-border bg-background/60 p-3">
            <label className="font-display text-xs uppercase text-muted-foreground">
              Move ops funds out of the bot wallet (SUI)
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              Type the amount yourself. This is not a dev-share payout — every SUI you move here is gas, ops or burn
              reserve money.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                type="number"
                step="0.001"
                min="0"
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 rounded-xl border border-input bg-background px-3 py-2 font-body text-sm outline-none focus:border-ring"
              />
            </div>


            {data.error ? (
              <p className="mt-2 text-xs text-destructive">{data.error}</p>
            ) : !data.botReady ? (
              <p className="mt-2 text-xs text-destructive">Bot wallet key not configured.</p>
            ) : null}

            {confirming ? (
              <div className="mt-3 flex flex-col gap-2">
                <p className="text-sm font-medium">
                  Send {amount} SUI from the bot wallet to your dev wallet?
                </p>
                <p className="text-xs text-muted-foreground">
                  This is a real on-chain transfer signed by the bot wallet. It cannot be undone.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => claim.mutate(Number(amount))}
                    disabled={claim.isPending}
                    className="flex-1"
                  >
                    {claim.isPending ? "Sending…" : (
                      <>
                        <ArrowDownToLine className="mr-1 inline size-4" />
                        Confirm transfer
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirming(false)}
                    disabled={claim.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                className="mt-3 w-full"
                onClick={handleClaim}
                disabled={!data.botReady || claim.isPending}
              >
                <ArrowDownToLine className="mr-1 inline size-4" />
                Claim to dev wallet
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-destructive">
          {status.error?.message ?? "Failed to load wallet balances."}
        </p>
      )}
    </section>
  );
}
