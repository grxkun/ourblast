import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { HandCoins } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useBlast } from "@/components/blast/session";
import { claimCreatorFeeVault, getCreatorFeeVaults } from "@/lib/terminal/creatorClaim.functions";
import { formatSui } from "@/lib/sui-balance";

/**
 * One-press distribution of accumulated creator fees for every token OURBLAST
 * launched. Pressing Claim pays each recipient written into the token at launch
 * — launcher, treasury, dev, bot, buy & burn — with no launchpad account needed.
 */
export function CreatorClaimCard() {
  const { userId, ready } = useBlast();
  const queryClient = useQueryClient();

  const readVaults = useServerFn(getCreatorFeeVaults);
  const vaults = useQuery({
    queryKey: ["creator-fee-vaults", userId],
    queryFn: () => readVaults({}),
    enabled: ready && Boolean(userId),
    staleTime: 30_000,
    retry: false,
  });

  const claimFn = useServerFn(claimCreatorFeeVault);
  const claim = useMutation({
    mutationFn: (curveId: string) => claimFn({ data: { curveId } }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(`$${result.symbol}: ${formatSui(result.claimedSui)} SUI distributed to all recipients.`);
      } else {
        toast.error(result.message);
      }
      void queryClient.invalidateQueries({ queryKey: ["creator-fee-vaults", userId] });
    },
    onError: (error: Error) => toast.error(error.message || "The distribution could not be sent."),
  });

  const data = vaults.data;
  const rows = data?.vaults ?? [];

  return (
    <section className="border border-border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg uppercase">
          <HandCoins className="mr-2 inline size-4" />Claim creator fees
        </h2>
        {data ? (
          <span className="font-display text-xs uppercase text-muted-foreground">
            {formatSui(data.totalPendingSui)} SUI waiting · yours {formatSui(data.yourPendingSui)} SUI
          </span>
        ) : null}
      </header>

      <p className="mt-2 text-sm text-muted-foreground">
        Trading fees pile up on each token until someone releases them. One press here pays every recipient set at
        launch — launcher, treasury, dev, bot and buy &amp; burn — in one on-chain payment. No launchpad sign-in.
      </p>

      {!userId ? (
        <p className="mt-3 text-sm text-muted-foreground">Sign in and connect your wallet to see your share.</p>
      ) : null}

      {userId && vaults.isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Reading fee balances from the chain…</p>
      ) : null}

      {userId && vaults.isError ? (
        <p className="mt-3 text-sm text-muted-foreground">Fee balances could not be read right now. Try again shortly.</p>
      ) : null}

      {userId && data && !data.wallet ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Connect a Sui wallet to your profile so we can show which of these fees pay you.
        </p>
      ) : null}

      {userId && data && rows.length === 0 && !vaults.isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">No tokens with claimable creator fees yet.</p>
      ) : null}

      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li key={row.curveId} className="flex flex-wrap items-center justify-between gap-2 border border-border p-3">
            <div className="min-w-0">
              <p className="font-display text-base uppercase">
                ${row.symbol} <span className="text-muted-foreground">{row.name}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {formatSui(row.pendingSui)} SUI waiting
                {row.yourBps > 0
                  ? ` · your ${row.yourBps / 100}% = ${formatSui(row.yourSui)} SUI`
                  : " · none of this pays your wallet"}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={!row.canClaim || row.pendingSui <= 0 || claim.isPending}
              onClick={() => claim.mutate(row.curveId)}
            >
              {claim.isPending && claim.variables === row.curveId ? "Distributing…" : "Claim"}
            </Button>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-muted-foreground">
        The split is fixed on chain when a token launches, so claiming can never send the money anywhere else. The
        treasury wallet owner and the launcher can both trigger it from here.
      </p>
    </section>
  );
}
