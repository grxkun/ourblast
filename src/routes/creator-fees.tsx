import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, HandCoins } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  DESIGNATION_DISCLAIMER,
  claimStateLabel,
  formatSui,
  shareText,
  shortWallet,
} from "@/lib/terminal/creatorFee";
import { getLiveCreatorFees } from "@/lib/terminal/liveFees.functions";
import { findLiveFee, walletShareSui } from "@/lib/terminal/liveFees";
import { timeAgo } from "@/lib/blast";

export const Route = createFileRoute("/creator-fees")({
  head: () => ({
    meta: [
      { title: "Designated creator fees | OURBLAST" },
      {
        name: "description",
        content:
          "Every token whose deployer designated another wallet to receive creator fees, sorted by unclaimed amount, with a claim page for each designated wallet.",
      },
      { property: "og:title", content: "Designated creator fees — OURBLAST" },
      {
        property: "og:description",
        content: "Unclaimed creator fees designated to other wallets, with a claim page for each. Designation is not endorsement.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CreatorFeesPage,
  errorComponent: () => <p className="p-6 text-sm text-muted-foreground">Could not load designations right now.</p>,
  notFoundComponent: () => <p className="p-6 text-sm text-muted-foreground">Nothing here.</p>,
});

function CreatorFeesPage() {
  const rows = useQuery({
    queryKey: ["fee-designations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_fee_designations")
        .select("*")
        .order("unclaimed_amount", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const readLive = useServerFn(getLiveCreatorFees);
  const live = useQuery({
    queryKey: ["live-creator-fees"],
    queryFn: () => readLive({}),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const copyShare = async (
    row: {
      token_symbol: string;
      unclaimed_amount: number | string;
      recipient_x_handle: string | null;
      recipient_wallet: string;
      token_address: string;
    },
    amount: number,
  ) => {
    await navigator.clipboard
      .writeText(
        shareText({
          tokenSymbol: row.token_symbol,
          unclaimedAmount: amount,
          recipientXHandle: row.recipient_x_handle,
          recipientWallet: row.recipient_wallet,
          claimUrl: `${window.location.origin}/claim/${row.token_address}`,
        }),
      )
      .catch(() => undefined);
    toast.success("Share text copied.");
  };

  // Live on-chain balances beat the stored snapshot, and the dashboard is
  // explicitly sorted by unclaimed amount rather than popularity.
  const liveRows = live.data?.rows;
  const list = (rows.data ?? [])
    .map((row) => {
      const onChain = findLiveFee(liveRows, { symbol: row.token_symbol, tokenAddress: row.token_address });
      const recipientShare = walletShareSui(onChain, row.recipient_wallet);
      return {
        row,
        onChain,
        unclaimed: recipientShare > 0 ? recipientShare : (onChain?.pendingSui ?? Number(row.unclaimed_amount ?? 0)),
      };
    })
    .sort((a, b) => b.unclaimed - a.unclaimed);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-10">
      <h1 className="flex items-center gap-2 font-display text-4xl uppercase">
        <HandCoins className="size-7 text-primary" /> Designated creator fees
      </h1>
      <p className="text-sm text-muted-foreground">{DESIGNATION_DISCLAIMER}</p>

      {rows.isLoading ? <p className="text-sm text-muted-foreground">Loading designations…</p> : null}
      {!rows.isLoading && list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No creator-fee designations recorded yet.</p>
      ) : null}

      <ul className="space-y-3">
        {list.map(({ row, onChain, unclaimed }) => (
          <li key={row.token_address} className="space-y-2 border-2 border-border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-display text-2xl">
                ${row.token_symbol}
                {row.token_name ? (
                  <span className="ml-2 font-body text-sm text-muted-foreground">{row.token_name}</span>
                ) : null}
              </p>
              <p className="font-display text-xl text-primary">
                Unclaimed: {onChain || unclaimed > 0 ? formatSui(unclaimed) : live.isLoading ? "reading…" : "0 SUI"}
              </p>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Designated recipient</dt>
              <dd className="break-all font-bold">
                {row.recipient_x_handle ? `@${row.recipient_x_handle} · ` : ""}
                {row.recipient_wallet}
              </dd>
              <dt className="text-muted-foreground">Deployer</dt>
              <dd className="font-bold">{shortWallet(row.deployer_wallet)}</dd>
              <dt className="text-muted-foreground">Launchpad</dt>
              <dd className="font-bold uppercase">{row.launchpad}</dd>
              {onChain ? (
                <>
                  <dt className="text-muted-foreground">Fees in the token now</dt>
                  <dd className="font-bold">{formatSui(onChain.pendingSui)}</dd>
                  <dt className="text-muted-foreground">Read from chain</dt>
                  <dd className="font-bold">{timeAgo(live.data?.readAt ?? new Date().toISOString())}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Designated</dt>
              <dd className="font-bold">{timeAgo(row.designated_at)}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-bold uppercase">{claimStateLabel({ status: row.status as "designated" })}</dd>
            </dl>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/claim/$token"
                params={{ token: row.token_address }}
                className="rounded-full bg-primary px-3 py-1 font-body text-xs text-primary-foreground"
              >
                View claim page
              </Link>
              <button
                type="button"
                onClick={() => void copyShare(row, unclaimed)}
                className="flex items-center gap-1 text-xs underline"
              >
                <Copy className="size-3" /> Copy share text
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
