import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Copy, Gift, Info, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useBlast } from "@/components/blast/session";
import { supabase } from "@/integrations/supabase/client";
import { claimCreatorFeeDesignation } from "@/lib/terminal/creatorFee.functions";
import { getLiveCreatorFees } from "@/lib/terminal/liveFees.functions";
import { findLiveFee, walletShareSui } from "@/lib/terminal/liveFees";
import {
  DESIGNATION_DISCLAIMER,
  formatSui,
  shareText,
  shortWallet,
  statusLabel,
} from "@/lib/terminal/creatorFee";
import { timeAgo } from "@/lib/blast";

/** Public claim page for a designated creator-fee recipient: /claim/<token-address>. */
export function DesignationClaim({ tokenAddress }: { tokenAddress: string }) {
  const address = tokenAddress.toLowerCase();
  const { userId, profile, connect, connecting } = useBlast();
  const queryClient = useQueryClient();

  const designation = useQuery({
    queryKey: ["fee-designation", address],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_fee_designations")
        .select("*")
        .eq("token_address", address)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 15_000,
  });

  const readLive = useServerFn(getLiveCreatorFees);
  const live = useQuery({
    queryKey: ["live-creator-fees"],
    queryFn: () => readLive({}),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const claimFn = useServerFn(claimCreatorFeeDesignation);
  const claim = useMutation({
    mutationFn: () => claimFn({ data: { tokenAddress: address } }),
    onSuccess: (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      void queryClient.invalidateQueries({ queryKey: ["fee-designation", address] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const row = designation.data;
  const wallet = profile?.wallet_address?.toLowerCase() ?? null;
  const isRecipient = Boolean(row && wallet && row.recipient_wallet.toLowerCase() === wallet);

  if (designation.isLoading) {
    return <p className="text-sm text-muted-foreground">Looking up this token…</p>;
  }

  if (!row) {
    return (
      <div className="border-2 border-border p-4">
        <p className="font-display text-xl uppercase">No designation found</p>
        <p className="mt-2 text-sm text-muted-foreground">
          No creator-fee recipient has been designated for {shortWallet(address)}.
        </p>
      </div>
    );
  }

  // Real balance read off chain; the stored snapshot is only a fallback.
  const onChain = findLiveFee(live.data?.rows, { symbol: row.token_symbol, tokenAddress: row.token_address });
  const recipientShare = walletShareSui(onChain, row.recipient_wallet);
  const unclaimed = onChain
    ? recipientShare > 0
      ? recipientShare
      : onChain.pendingSui
    : Number(row.unclaimed_amount ?? 0);

  const copyShare = async () => {
    await navigator.clipboard
      .writeText(
        shareText({
          tokenSymbol: row.token_symbol,
          unclaimedAmount: unclaimed,
          recipientXHandle: row.recipient_x_handle,
          recipientWallet: row.recipient_wallet,
          claimUrl: `${window.location.origin}/claim/${row.token_address}`,
        }),
      )
      .catch(() => undefined);
    toast.success("Share text copied.");
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 border-2 border-border p-4">
        <p className="flex items-center gap-2 font-display text-2xl uppercase">
          <Gift className="size-5 text-primary" /> ${row.token_symbol}
          {row.token_name ? <span className="font-body text-sm normal-case text-muted-foreground">{row.token_name}</span> : null}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-y border-border py-3 text-sm">
          <dt className="text-muted-foreground">Status</dt>
          <dd className="font-bold uppercase">
            {statusLabel({ status: row.status as "designated", unclaimedAmount: unclaimed })}
          </dd>
          <dt className="text-muted-foreground">Unclaimed creator fees</dt>
          <dd className="font-bold">
            {onChain || unclaimed > 0 ? formatSui(unclaimed) : live.isLoading ? "reading from chain…" : "0 SUI"}
          </dd>
          {onChain ? (
            <>
              <dt className="text-muted-foreground">Fees waiting in the token</dt>
              <dd className="font-bold">{formatSui(onChain.pendingSui)}</dd>
              <dt className="text-muted-foreground">Read from chain</dt>
              <dd className="font-bold">{timeAgo(live.data?.readAt ?? new Date().toISOString())}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Fee recipient wallet</dt>
          <dd className="break-all font-bold">{row.recipient_wallet}</dd>
          {row.recipient_x_handle || row.recipient_name ? (
            <>
              <dt className="text-muted-foreground">Recipient label</dt>
              <dd className="font-bold">
                {row.recipient_name ?? ""}
                {row.recipient_x_handle ? ` @${row.recipient_x_handle}` : ""}
              </dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Trading volume</dt>
          <dd className="font-bold">{Number(row.trading_volume ?? 0) > 0 ? formatSui(Number(row.trading_volume)) : "Not indexed yet"}</dd>
          <dt className="text-muted-foreground">Claimed so far</dt>
          <dd className="font-bold">{formatSui(Number(row.claimed_amount ?? 0))}</dd>
          <dt className="text-muted-foreground">Token address</dt>
          <dd className="break-all font-bold">{row.token_address}</dd>
          <dt className="text-muted-foreground">Launchpad</dt>
          <dd className="font-bold uppercase">{row.launchpad}</dd>
          <dt className="text-muted-foreground">Deployed / designated</dt>
          <dd className="font-bold">{timeAgo(row.designated_at)}</dd>
          <dt className="text-muted-foreground">Deployer</dt>
          <dd className="break-all font-bold">{shortWallet(row.deployer_wallet)}</dd>
          {row.designation_tx ? (
            <>
              <dt className="text-muted-foreground">Designation tx</dt>
              <dd className="break-all font-bold">{row.designation_tx}</dd>
            </>
          ) : null}
          {row.claim_tx ? (
            <>
              <dt className="text-muted-foreground">Claim tx</dt>
              <dd className="break-all font-bold">{row.claim_tx}</dd>
            </>
          ) : null}
        </dl>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="text-foreground">Creator Fee Designation.</strong> {DESIGNATION_DISCLAIMER}
          </span>
        </p>
      </div>

      {row.status === "recalled" ? (
        <div className="border-2 border-border p-4">
          <p className="font-display text-xl uppercase">Endorsement recalled</p>
          <p className="mt-2 text-sm text-muted-foreground">
            The deployer took this designation back, so this wallet can no longer claim these creator fees.
          </p>
        </div>
      ) : row.status === "claimed" ? (
        <div className="border-2 border-primary p-4">
          <p className="flex items-center gap-2 font-display text-xl uppercase">
            <BadgeCheck className="size-5 text-primary" /> Claimed
          </p>
          <p className="mt-2 break-all text-sm text-muted-foreground">
            Claimed by {row.claimed_wallet}. Creator fees pay to that wallet on chain — OURBLAST never holds them.
          </p>
        </div>
      ) : (
        <div className="space-y-3 border-2 border-border p-4">
          <p className="font-display text-xl uppercase">Claim as the designated recipient</p>
          <p className="text-sm text-muted-foreground">
            Connect the designated wallet {shortWallet(row.recipient_wallet)} to confirm the designation. Only the wallet
            that controls this address can claim.
          </p>
          {!userId || !wallet ? (
            <Button type="button" variant="outline" onClick={() => void connect()} disabled={connecting}>
              <Wallet /> {connecting ? "Connecting…" : "Connect Sui wallet"}
            </Button>
          ) : (
            <>
              {!isRecipient ? (
                <p className="text-xs text-muted-foreground">
                  Connected wallet {shortWallet(wallet)} is not the designated recipient.
                </p>
              ) : null}
              <Button type="button" disabled={!isRecipient || claim.isPending} onClick={() => claim.mutate()}>
                <Gift /> {claim.isPending ? "Claiming…" : "Verify & claim"}
              </Button>
            </>
          )}
          <button type="button" onClick={() => void copyShare()} className="flex items-center gap-1 text-xs underline">
            <Copy className="size-3" /> Copy share text for X
          </button>
        </div>
      )}
    </div>
  );
}
