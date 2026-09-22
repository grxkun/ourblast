import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, HandCoins, Link2, RotateCcw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBlast } from "@/components/blast/session";
import {
  designateCreatorFee,
  getMyDesignations,
  recallCreatorFeeDesignation,
} from "@/lib/terminal/creatorFee.functions";
import {
  canRecallDesignation,
  DESIGNATION_AUTHORIZATION,
  DESIGNATION_DISCLAIMER,
  formatSui,
  RECALL_NOTE,
  recipientLockedNote,
  shareText,
  shortWallet,
  statusLabel,
} from "@/lib/terminal/creatorFee";
import { LAUNCHPADS } from "@/lib/terminal/launchpad";

/**
 * Terminal panel where a deployer designates who receives a token's creator
 * fees: keep them, or endorse another wallet (metadata name / X handle are
 * labels only and imply no endorsement by that person).
 */
export function CreatorFeeDesignationCard() {
  const { userId, ready } = useBlast();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<"keep" | "redirect">("keep");
  const [tokenAddress, setTokenAddress] = useState("");
  const [symbol, setSymbol] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [launchpad, setLaunchpad] = useState("suipump");
  const [recipientWallet, setRecipientWallet] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientHandle, setRecipientHandle] = useState("");
  const [authorized, setAuthorized] = useState(false);

  const fetchMine = useServerFn(getMyDesignations);
  const mine = useQuery({
    queryKey: ["my-fee-designations", userId],
    enabled: ready && Boolean(userId),
    queryFn: () => fetchMine({}),
  });

  const designateFn = useServerFn(designateCreatorFee);
  const submit = useMutation({
    mutationFn: () =>
      designateFn({
        data: {
          tokenAddress,
          tokenSymbol: symbol,
          tokenName: tokenName || null,
          launchpad,
          recipientWallet,
          recipientName: recipientName || null,
          recipientXHandle: recipientHandle || null,
          authorized,
        },
      }),
    onSuccess: () => {
      toast.success("Recipient designated. The claim page is live.");
      setAuthorized(false);
      void queryClient.invalidateQueries({ queryKey: ["my-fee-designations", userId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const recallFn = useServerFn(recallCreatorFeeDesignation);
  const [confirmRecall, setConfirmRecall] = useState<string | null>(null);
  const recall = useMutation({
    mutationFn: (tokenAddress: string) => recallFn({ data: { tokenAddress } }),
    onSuccess: (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      setConfirmRecall(null);
      void queryClient.invalidateQueries({ queryKey: ["my-fee-designations", userId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const copyShare = async (row: {
    token_symbol: string;
    unclaimed_amount: number | string;
    recipient_x_handle: string | null;
    recipient_wallet: string;
    token_address: string;
  }) => {
    const text = shareText({
      tokenSymbol: row.token_symbol,
      unclaimedAmount: Number(row.unclaimed_amount ?? 0),
      recipientXHandle: row.recipient_x_handle,
      recipientWallet: row.recipient_wallet,
      claimUrl: `${window.location.origin}/claim/${row.token_address}`,
    });
    await navigator.clipboard.writeText(text).catch(() => undefined);
    toast.success("Share text copied.");
  };

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <p className="flex items-center gap-2 font-display text-lg uppercase">
        <HandCoins className="size-4 text-primary" /> Creator fee designation
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Keep a token's creator fees, or designate another wallet to receive them. {DESIGNATION_DISCLAIMER}
      </p>

      {!userId ? (
        <p className="mt-3 text-sm text-muted-foreground">Sign in to designate a creator-fee recipient.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={mode === "keep" ? "default" : "outline"} onClick={() => setMode("keep")}>
              Keep creator fees
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "redirect" ? "default" : "outline"}
              onClick={() => setMode("redirect")}
            >
              Endorse / redirect fees
            </Button>
          </div>

          {mode === "keep" ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Creator fees stay claimable by you — nothing to record. Switch to “Endorse / redirect” to designate
              someone else before you deploy.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="flex items-start gap-2 rounded border border-primary/40 bg-primary/5 p-3 text-xs text-muted-foreground">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" /> {recipientLockedNote(launchpad)}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold uppercase text-muted-foreground">
                  Token address
                  <Input value={tokenAddress} onChange={(e) => setTokenAddress(e.target.value.trim())} placeholder="0x…" className="mt-1" />
                </label>
                <label className="text-xs font-bold uppercase text-muted-foreground">
                  Ticker
                  <Input
                    value={symbol}
                    maxLength={10}
                    onChange={(e) => setSymbol(e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())}
                    className="mt-1"
                  />
                </label>
                <label className="text-xs font-bold uppercase text-muted-foreground">
                  Token name
                  <Input value={tokenName} maxLength={64} onChange={(e) => setTokenName(e.target.value)} className="mt-1" />
                </label>
                <label className="text-xs font-bold uppercase text-muted-foreground">
                  Launchpad
                  <select
                    value={launchpad}
                    onChange={(e) => setLaunchpad(e.target.value)}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {LAUNCHPADS.filter((pad) => pad.integrated).map((pad) => (
                      <option key={pad.id} value={pad.id}>
                        {pad.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold uppercase text-muted-foreground sm:col-span-2">
                  Recipient wallet
                  <Input
                    value={recipientWallet}
                    onChange={(e) => setRecipientWallet(e.target.value.trim())}
                    placeholder="0x… destination Sui wallet"
                    className="mt-1"
                  />
                </label>
                <label className="text-xs font-bold uppercase text-muted-foreground">
                  Recipient name (optional)
                  <Input value={recipientName} maxLength={64} onChange={(e) => setRecipientName(e.target.value)} className="mt-1" />
                </label>
                <label className="text-xs font-bold uppercase text-muted-foreground">
                  Recipient X handle (optional)
                  <Input
                    value={recipientHandle ? `@${recipientHandle}` : ""}
                    onChange={(e) => setRecipientHandle(e.target.value.replace(/[^a-z0-9_]/gi, "").slice(0, 15))}
                    placeholder="@handle"
                    className="mt-1"
                  />
                </label>
              </div>
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={authorized}
                  onChange={(e) => setAuthorized(e.target.checked)}
                  className="mt-0.5 size-4"
                />
                <span>{DESIGNATION_AUTHORIZATION}</span>
              </label>
              <Button
                type="button"
                disabled={!authorized || !tokenAddress || !symbol || !recipientWallet || submit.isPending}
                onClick={() => submit.mutate()}
              >
                <Link2 /> {submit.isPending ? "Designating…" : "Designate recipient"}
              </Button>
            </div>
          )}

          <div className="mt-5 border-t border-border pt-4">
            <p className="font-display text-sm uppercase">Your designations</p>
            {(mine.data ?? []).length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No designations yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {(mine.data ?? []).map((row) => (
                  <li key={row.token_address} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 text-xs">
                    <span>
                      <span className="font-display text-base">${row.token_symbol}</span>{" "}
                      <span className="text-muted-foreground">
                        → {row.recipient_x_handle ? `@${row.recipient_x_handle}` : shortWallet(row.recipient_wallet)} ·{" "}
                        {statusLabel({ status: row.status as "designated", unclaimedAmount: Number(row.unclaimed_amount ?? 0) })} ·{" "}
                        {formatSui(Number(row.unclaimed_amount ?? 0))} unclaimed
                      </span>
                    </span>
                    <span className="flex gap-2">
                      <a href={`/claim/${row.token_address}`} className="underline">
                        Claim page
                      </a>
                      <button type="button" className="inline-flex items-center gap-1 underline" onClick={() => void copyShare(row)}>
                        <Copy className="size-3" /> Share text
                      </button>
                      {canRecallDesignation({ status: row.status as "designated" }) ? (
                        confirmRecall === row.token_address ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 font-bold text-destructive underline"
                            disabled={recall.isPending}
                            onClick={() => recall.mutate(row.token_address)}
                          >
                            <RotateCcw className="size-3" /> {recall.isPending ? "Recalling…" : "Confirm recall"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 underline"
                            title={RECALL_NOTE}
                            onClick={() => setConfirmRecall(row.token_address)}
                          >
                            <RotateCcw className="size-3" /> Recall
                          </button>
                        )
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
