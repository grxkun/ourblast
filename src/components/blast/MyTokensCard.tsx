import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { SectionTitle } from "@/components/blast/AppShell";
import { useBlast } from "@/components/blast/session";
import { getMyTokens } from "@/lib/terminal/feePayout.functions";
import { timeAgo } from "@/lib/blast";

/** "My tokens" — every token the player's linked X account launched, and where its fee share goes. */
export function MyTokensCard() {
  const { userId } = useBlast();
  const fetchMyTokens = useServerFn(getMyTokens);

  const myTokens = useQuery({
    queryKey: ["my-tokens", userId],
    enabled: Boolean(userId),
    refetchInterval: 60_000,
    queryFn: () => fetchMyTokens({}),
  });

  if (!userId) return null;
  const tokens = myTokens.data?.tokens ?? [];
  const handle = myTokens.data?.handle;

  return (
    <section className="panel p-5 sm:p-6">
      <SectionTitle kicker="Launcher" title="My tokens" />
      {!handle && myTokens.data ? (
        <p className="font-body text-muted-foreground">
          No X account linked — link X in the{" "}
          <Link to="/terminal" className="text-cyber underline">
            terminal
          </Link>{" "}
          so tokens launched from your tweets show up here.
        </p>
      ) : tokens.length === 0 ? (
        <p className="font-body text-muted-foreground">
          No tokens launched yet — tweet{" "}
          <span className="text-lime">@Ourblastbot deploy $TICKER Name</span> and it appears here.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {tokens.map((t) => (
            <li key={`${t.symbol}-${t.createdAt}`} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-lg">
                    ${t.symbol}
                    {t.name ? <span className="ml-2 font-body text-sm text-muted-foreground">{t.name}</span> : null}
                  </p>
                  <p className="font-body text-xs text-muted-foreground">
                    {t.launchpad} · {t.status.toLowerCase()} · {timeAgo(t.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {t.tokenUrl ? (
                    <a
                      href={t.tokenUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-border px-3 py-1 font-body text-xs text-cyber"
                    >
                      View token
                    </a>
                  ) : null}
                  {t.claimToken ? (
                    <Link
                      to="/claim/$token"
                      params={{ token: t.claimToken }}
                      className="glow-blast rounded-full bg-primary px-3 py-1 font-body text-xs text-primary-foreground"
                    >
                      Claim fees
                    </Link>
                  ) : null}
                </div>
              </div>
              <p className="mt-1.5 font-body text-xs">
                {t.feeMode === "wallet" ? (
                  <span className="text-lime">
                    Your {(t.shareBps / 100).toFixed(0)}% share pays on-chain to{" "}
                    <span className="break-all">{t.destinationWallet ?? "your wallet"}</span> — nothing to claim.
                  </span>
                ) : t.feeMode === "perps" ? (
                  <span className="text-muted-foreground">
                    Perpsplexity pool — creator fees pay through its own mechanism.
                  </span>
                ) : t.claimStatus === "claimed" ? (
                  <span className="text-lime">
                    Share claimed
                    {t.destinationWallet ? (
                      <>
                        {" "}to <span className="break-all">{t.destinationWallet}</span>
                      </>
                    ) : null}
                    .
                  </span>
                ) : t.claimToken ? (
                  <span className="text-muted-foreground">
                    Your {(t.shareBps / 100).toFixed(0)}% share is parked — open the claim link to route it to your
                    wallet.
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    Your {(t.shareBps / 100).toFixed(0)}% share accrues automatically; link a wallet to receive it
                    on-chain.
                  </span>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
