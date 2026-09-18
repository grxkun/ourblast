import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useBlast } from "@/components/blast/session";
import { claimFeeLink, getFeeClaim } from "@/lib/terminal/feePayout.functions";

export const Route = createFileRoute("/claim/$token")({
  head: () => ({
    meta: [
      { title: "Claim your creator fees | OURBLAST" },
      { name: "description", content: "Claim the creator fees a token launcher parked for your X account. Connect your Sui wallet and pull the payout." },
      { property: "og:title", content: "Claim your creator fees — OURBLAST" },
      { property: "og:description", content: "A launcher routed their creator fee share to your X account. Connect a Sui wallet to claim it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClaimPage,
});

function ClaimPage() {
  const { token } = Route.useParams();
  const { profile, connect, connecting } = useBlast();
  const wallet = profile?.wallet_address ?? null;
  const queryClient = useQueryClient();

  const readClaim = useServerFn(getFeeClaim);
  const claim = useQuery({
    queryKey: ["fee-claim", token],
    queryFn: () => readClaim({ data: { token } }),
    staleTime: 15_000,
  });

  const claimFn = useServerFn(claimFeeLink);
  const submit = useMutation({
    mutationFn: () => claimFn({ data: { token, wallet: wallet ?? "" } }),
    onSuccess: (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      void queryClient.invalidateQueries({ queryKey: ["fee-claim", token] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const row = claim.data;

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 px-4 py-10">
      <h1 className="font-display text-4xl uppercase">Creator fee claim</h1>

      {claim.isLoading ? <p className="text-sm text-muted-foreground">Looking up this claim link…</p> : null}

      {!claim.isLoading && !row ? (
        <div className="border-2 border-border p-4">
          <p className="font-display text-xl uppercase">Link not found</p>
          <p className="mt-2 text-sm text-muted-foreground">This claim link does not exist. Ask the launcher to generate a fresh one.</p>
        </div>
      ) : null}

      {row ? (
        <div className="space-y-4 border-2 border-border p-4">
          <p className="flex items-center gap-2 font-display text-xl uppercase">
            <Gift className="size-5 text-primary" /> ${row.launch_symbol} fees for @{row.x_username}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-y border-border py-3 text-sm">
            <dt className="text-muted-foreground">Token</dt><dd className="font-bold">${row.launch_symbol}</dd>
            <dt className="text-muted-foreground">Parked for</dt><dd className="font-bold">@{row.x_username}</dd>
            <dt className="text-muted-foreground">Amount</dt><dd className="font-bold">{Number(row.amount_sui)} SUI</dd>
            <dt className="text-muted-foreground">Status</dt><dd className="font-bold uppercase">{row.status}</dd>
          </dl>

          {row.status === "claimed" ? (
            <p className="text-sm text-muted-foreground">
              Already claimed to {row.claimed_wallet}. Payouts land in that wallet — open it in Slush to see the balance.
            </p>
          ) : wallet ? (
            <>
              <p className="text-sm text-muted-foreground">Claiming to your connected wallet {wallet.slice(0, 6)}…{wallet.slice(-4)}.</p>
              <Button type="button" onClick={() => submit.mutate()} disabled={submit.isPending}>
                <Gift /> {submit.isPending ? "Claiming…" : "Claim to this wallet"}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Connect the Sui wallet you want the fees paid into.</p>
              <Button type="button" onClick={() => void connect()} disabled={connecting}>
                <Wallet /> {connecting ? "Connecting…" : "Connect Sui Wallet"}
              </Button>
            </>
          )}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Claim links are one-time. OURBLAST never asks for a seed phrase or private key — only a wallet connection.
      </p>
    </div>
  );
}
