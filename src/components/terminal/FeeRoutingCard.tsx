import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Coins, Link2, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createFeeClaimLink,
  getLaunchFeePayouts,
  saveLaunchFeePayout,
} from "@/lib/terminal/feePayout.functions";
import {
  describeFeePayout,
  normalizeXUsername,
  type FeePayoutMode,
} from "@/lib/terminal/feePayout";
import { CREATOR_FEE_SPLIT } from "@/lib/terminal/fees";

const MODES: { id: FeePayoutMode; label: string }[] = [
  { id: "creator", label: "Me (launcher)" },
  { id: "wallet", label: "Another wallet" },
  { id: "x", label: "An X account" },
];

/**
 * Redirects the launcher's share of the creator fee for a token that is already
 * live. Destinations are re-validated server-side; an X destination gets a
 * one-time claim link the recipient opens with their own wallet.
 */
export function FeeRoutingCard() {
  const queryClient = useQueryClient();
  const readPayouts = useServerFn(getLaunchFeePayouts);
  const payouts = useQuery({
    queryKey: ["launch-fee-payouts"],
    queryFn: () => readPayouts({}),
    staleTime: 30_000,
    retry: false,
  });

  const [symbol, setSymbol] = useState("");
  const [mode, setMode] = useState<FeePayoutMode>("creator");
  const [wallet, setWallet] = useState("");
  const [xUsername, setXUsername] = useState("");
  const [claimLink, setClaimLink] = useState<string | null>(null);

  const savePayout = useServerFn(saveLaunchFeePayout);
  const save = useMutation({
    mutationFn: () =>
      savePayout({
        data: {
          symbol: symbol.replace(/[^a-z0-9]/gi, "").toUpperCase(),
          launchpad: "suipump",
          mode,
          wallet: mode === "wallet" ? wallet.trim() : null,
          xUsername: mode === "x" ? normalizeXUsername(xUsername) : null,
        },
      }),
    onSuccess: (result) => {
      result.notes.forEach((note) => toast.warning(note));
      toast.success(describeFeePayout(result.payout));
      void queryClient.invalidateQueries({ queryKey: ["launch-fee-payouts"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const makeClaimLink = useServerFn(createFeeClaimLink);
  const claim = useMutation({
    mutationFn: (row: { symbol: string; xUsername: string }) =>
      makeClaimLink({ data: { symbol: row.symbol, xUsername: row.xUsername, amountSui: 0 } }),
    onSuccess: async (result) => {
      const url = `${window.location.origin}${result.path}`;
      setClaimLink(url);
      await navigator.clipboard.writeText(url).catch(() => undefined);
      toast.success(`Claim link for @${result.xUsername} copied.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const canSave =
    symbol.trim().length >= 2 &&
    (mode !== "wallet" || wallet.trim().length > 10) &&
    (mode !== "x" || normalizeXUsername(xUsername).length > 0);

  return (
    <div className="border-2 border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <span className="flex items-center gap-2 font-display text-lg uppercase">
          <Coins className="size-4 text-primary" /> Creator fee routing
        </span>
        <span className="font-body text-[0.65rem] font-bold uppercase text-muted-foreground">
          {Math.round(CREATOR_FEE_SPLIT.launcher * 100)}% launcher share
        </span>
      </div>

      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">
          Send your share of a live token&apos;s creator fees somewhere else — your own wallet, another wallet, or an X
          account that claims it with a one-time link.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold uppercase text-muted-foreground">
            Token symbol
            <Input
              value={symbol}
              maxLength={10}
              placeholder="UTOPIA"
              onChange={(event) => setSymbol(event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())}
              className="mt-1"
            />
          </label>
          <div className="text-xs font-bold uppercase text-muted-foreground">
            Fees go to
            <div className="mt-1 flex flex-wrap gap-2">
              {MODES.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  size="sm"
                  variant={mode === option.id ? "default" : "outline"}
                  onClick={() => setMode(option.id)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {mode === "wallet" ? (
          <label className="block text-xs font-bold uppercase text-muted-foreground">
            Destination Sui wallet
            <Input value={wallet} placeholder="0x…" onChange={(event) => setWallet(event.target.value)} className="mt-1" />
          </label>
        ) : null}

        {mode === "x" ? (
          <label className="block text-xs font-bold uppercase text-muted-foreground">
            Destination X account
            <Input value={xUsername} placeholder="@handle" onChange={(event) => setXUsername(event.target.value)} className="mt-1" />
          </label>
        ) : null}

        <Button type="button" onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
          <Save /> {save.isPending ? "Saving…" : "Redirect these fees"}
        </Button>

        {payouts.isError ? (
          <p className="text-xs text-muted-foreground">Sign in above to see and change where your fees go.</p>
        ) : null}

        {payouts.data?.length ? (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="font-display text-sm uppercase">Current routing</p>
            {payouts.data.map((row) => (
              <div key={`${row.launch_symbol}-${row.updated_at}`} className="flex flex-wrap items-center justify-between gap-2 border border-border p-2 text-sm">
                <span className="font-bold">${row.launch_symbol}</span>
                <span className="text-muted-foreground">
                  {describeFeePayout({
                    mode: row.mode as FeePayoutMode,
                    wallet: row.destination_wallet,
                    xUsername: row.destination_x_username,
                  })}
                </span>
                {row.mode === "x" && row.destination_x_username ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={claim.isPending}
                    onClick={() => claim.mutate({ symbol: row.launch_symbol, xUsername: row.destination_x_username! })}
                  >
                    <Link2 /> {claim.isPending ? "Creating…" : "Claim link"}
                  </Button>
                ) : null}
              </div>
            ))}
            {claimLink ? <p className="break-all text-[0.65rem] text-muted-foreground">{claimLink}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
