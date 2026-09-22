import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, Check, Copy, ExternalLink, Gift, ShieldCheck, Wallet, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useBlast } from "@/components/blast/session";
import { claimFeeLink, getClaimViewer, getFeeClaim, issueSlushClaimLink } from "@/lib/terminal/feePayout.functions";
import { CREATOR_FEE_SPLIT } from "@/lib/terminal/fees";
import { looksLikeTokenAddress } from "@/lib/terminal/creatorFee";
import { DesignationClaim } from "@/components/fees/DesignationClaim";

export const Route = createFileRoute("/claim/$token")({
  head: () => ({
    meta: [
      { title: "Claim your 70% creator share | OURBLAST" },
      {
        name: "description",
        content:
          "Verify the X account a launch was called from, connect a Sui wallet, and claim the 70% creator fee share reserved for you.",
      },
      { property: "og:title", content: "Claim your 70% creator share — OURBLAST" },
      {
        property: "og:description",
        content: "Sign in with X, connect a Sui wallet, and release the launcher share reserved for your handle.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClaimPage,
});

function Step({
  index,
  title,
  done,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border-2 border-border p-4">
      <p className="flex items-center gap-2 font-display text-lg uppercase">
        <span
          className={`flex size-6 items-center justify-center border-2 border-border text-xs ${
            done ? "bg-primary text-primary-foreground" : ""
          }`}
        >
          {done ? <Check className="size-3" /> : index}
        </span>
        {title}
      </p>
      <div className="mt-3 space-y-3 text-sm">{children}</div>
    </div>
  );
}

function ClaimPage() {
  const { token } = Route.useParams();

  // /claim/<token-address> opens the public creator-fee designation claim page,
  // /claim/<link-token> the one-time launcher claim link below.
  if (looksLikeTokenAddress(token)) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-4 px-4 py-10">
        <h1 className="font-display text-4xl uppercase">Creator fee designation</h1>
        <DesignationClaim tokenAddress={token} />
      </div>
    );
  }

  return <LinkClaimPage token={token} />;
}

function LinkClaimPage({ token }: { token: string }) {
  const { userId, profile, connect, connecting, loginWithX } = useBlast();
  const wallet = profile?.wallet_address ?? null;
  const queryClient = useQueryClient();

  const readClaim = useServerFn(getFeeClaim);
  const claim = useQuery({
    queryKey: ["fee-claim", token],
    queryFn: () => readClaim({ data: { token } }),
    staleTime: 15_000,
  });

  const readViewer = useServerFn(getClaimViewer);
  const viewer = useQuery({
    queryKey: ["fee-claim-viewer", token, userId],
    enabled: Boolean(userId),
    queryFn: () => readViewer({ data: { token } }),
  });

  const claimFn = useServerFn(claimFeeLink);
  const submit = useMutation({
    mutationFn: () => claimFn({ data: { token } }),
    onSuccess: (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      void queryClient.invalidateQueries({ queryKey: ["fee-claim", token] });
      void queryClient.invalidateQueries({ queryKey: ["fee-claim-viewer", token, userId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const slushFn = useServerFn(issueSlushClaimLink);
  const slush = useMutation({
    mutationFn: () => slushFn({ data: { token } }),
    onSuccess: (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      void queryClient.invalidateQueries({ queryKey: ["fee-claim", token] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const row = claim.data;
  const slushUrl = row?.slush_url ?? slush.data?.url ?? null;
  const linkedX = viewer.data?.xUsername ?? null;
  const xMatches = viewer.data?.xMatches ?? false;
  const walletReady = Boolean(viewer.data?.wallet ?? wallet);
  const verified = xMatches && walletReady;

  const startXSignIn = () => {
    sessionStorage.setItem("ourblast.x.returnTo", `/claim/${token}`);
    void loginWithX();
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 px-4 py-10">
      <h1 className="font-display text-4xl uppercase">Claim your creator share</h1>

      {claim.isLoading ? <p className="text-sm text-muted-foreground">Looking up this claim link…</p> : null}

      {!claim.isLoading && !row ? (
        <div className="border-2 border-border p-4">
          <p className="font-display text-xl uppercase">Link not found</p>
          <p className="mt-2 text-sm text-muted-foreground">
            This claim link does not exist. Ask the launcher to generate a fresh one.
          </p>
        </div>
      ) : null}

      {row ? (
        <>
          <div className="space-y-3 border-2 border-border p-4">
            <p className="flex items-center gap-2 font-display text-xl uppercase">
              <Gift className="size-5 text-primary" /> ${row.launch_symbol} reserved for @{row.x_username}
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-y border-border py-3 text-sm">
              <dt className="text-muted-foreground">Token</dt>
              <dd className="font-bold">${row.launch_symbol}</dd>
              <dt className="text-muted-foreground">Reserved for</dt>
              <dd className="font-bold">@{row.x_username}</dd>
              <dt className="text-muted-foreground">Your share</dt>
              <dd className="font-bold">{Math.round(CREATOR_FEE_SPLIT.launcher * 100)}% of creator fees</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-bold uppercase">{row.status}</dd>
            </dl>
            <p className="text-xs text-muted-foreground">
              The launchpad pays creator fees out of trading volume, continuously. Claiming points your share at your
              own wallet — there is nothing to pay and nothing to sign.
            </p>
          </div>

          <div className="space-y-3 border-2 border-primary p-4">
            <p className="flex items-center gap-2 font-display text-xl uppercase">
              <Zap className="size-5 text-primary" /> Claim into a wallet you already have
            </p>
            <p className="text-sm text-muted-foreground">
              Your share is sent as a Slush claim link. Open it in Slush — or any Sui wallet — and the SUI lands in your
              existing wallet. No new wallet, no account here, nothing to sign on this page.
            </p>
            {slushUrl ? (
              <div className="space-y-2">
                <p className="break-all border border-border p-2 text-xs">{slushUrl}</p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <a href={slushUrl} target="_blank" rel="noreferrer noopener">
                      <ExternalLink /> Open in Slush
                    </a>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard.writeText(slushUrl).catch(() => undefined);
                      toast.success("Claim link copied.");
                    }}
                  >
                    <Copy /> Copy link
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Anyone with this link can sweep the SUI — keep it to yourself until you have claimed it.
                </p>
              </div>
            ) : (
              <>
                <Button type="button" onClick={() => slush.mutate()} disabled={slush.isPending}>
                  <Zap /> {slush.isPending ? "Preparing link…" : "Send my share as a Slush link"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Available now: {Number(row.amount_sui ?? 0)} SUI. Fees keep accruing from trading volume — link your
                  wallet below and future launches pay it directly.
                </p>
              </>
            )}
          </div>

          {row.status === "claimed" ? (
            <div className="border-2 border-primary p-4">
              <p className="flex items-center gap-2 font-display text-xl uppercase">
                <ShieldCheck className="size-5 text-primary" /> Claimed
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Your ${row.launch_symbol} share goes to {row.claimed_wallet}. Future launches from @{row.x_username} pay
                that wallet automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <Step index={1} title="Verify your X account" done={xMatches}>
                {xMatches ? (
                  <p className="text-muted-foreground">Signed in as 𝕏 @{linkedX} — handle matches.</p>
                ) : (
                  <>
                    <p className="text-muted-foreground">
                      {linkedX
                        ? `You are signed in as @${linkedX}, but these fees are reserved for @${row.x_username}. Sign in with that account.`
                        : `Sign in with the X account @${row.x_username} so we know it is really you.`}
                    </p>
                    <Button type="button" onClick={startXSignIn} disabled={connecting}>
                      <AtSign /> Sign in with X
                    </Button>
                  </>
                )}
              </Step>

              <Step index={2} title="Connect your Sui wallet" done={walletReady}>
                {walletReady ? (
                  <p className="text-muted-foreground">
                    Payout wallet {(viewer.data?.wallet ?? wallet ?? "").slice(0, 6)}…
                    {(viewer.data?.wallet ?? wallet ?? "").slice(-4)}
                  </p>
                ) : (
                  <>
                    <p className="text-muted-foreground">Connect the Sui wallet you want the fees paid into.</p>
                    <Button type="button" variant="outline" onClick={() => void connect()} disabled={connecting}>
                      <Wallet /> {connecting ? "Connecting…" : "Connect Sui Wallet"}
                    </Button>
                  </>
                )}
              </Step>

              <Step index={3} title="Claim your share" done={false}>
                <p className="text-muted-foreground">
                  {verified
                    ? `Everything checks out — release the ${Math.round(CREATOR_FEE_SPLIT.launcher * 100)}% share to your wallet.`
                    : "Finish the two steps above to unlock this."}
                </p>
                <Button type="button" onClick={() => submit.mutate()} disabled={!verified || submit.isPending}>
                  <Gift /> {submit.isPending ? "Claiming…" : "Verify & claim"}
                </Button>
              </Step>
            </div>
          )}
        </>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Claim links are one-time and only work for the X account they were reserved for. OURBLAST never asks for a seed
        phrase or private key — only a wallet connection.
      </p>
    </div>
  );
}
