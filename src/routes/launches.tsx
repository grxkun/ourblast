import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ExternalLink, Radio } from "lucide-react";

import { SectionTitle } from "@/components/blast/AppShell";
import { listPublicLaunches, type PublicLaunchRow } from "@/lib/terminal/launch-status.functions";

const launchesQuery = queryOptions({
  queryKey: ["public-launches"],
  queryFn: () => listPublicLaunches(),
  refetchInterval: 20_000,
});

export const Route = createFileRoute("/launches")({
  loader: ({ context }) => context.queryClient.ensureQueryData(launchesQuery),
  head: () => ({
    meta: [
      { title: "Launch Status — OURBLAST" },
      {
        name: "description",
        content:
          "Live public feed of every launch tweet @ourblastbot detected: the parsed token, the transaction digest and the final on-chain result on Sui.",
      },
      { property: "og:title", content: "Launch Status — OURBLAST" },
      {
        property: "og:description",
        content: "Every detected launch tweet, parsed token details and the confirmed on-chain result — straight from Sui.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LaunchesPage,
});

const STATUS_STYLES: Record<string, string> = {
  DEPLOYED: "bg-primary/15 text-primary border-primary/40",
  PENDING: "bg-accent/15 text-accent-foreground border-accent/40",
  LAUNCHING: "bg-accent/15 text-accent-foreground border-accent/40",
  READY: "bg-secondary text-secondary-foreground border-border",
  FAILED: "bg-destructive/15 text-destructive border-destructive/40",
  UNAVAILABLE: "bg-destructive/15 text-destructive border-destructive/40",
};

function statusStyle(status: string): string {
  return STATUS_STYLES[status] ?? "bg-muted text-muted-foreground border-border";
}

function tweetUrl(row: PublicLaunchRow): string {
  return `https://x.com/${row.xUsername}/status/${row.xPostId}`;
}

function replyState(row: PublicLaunchRow): { label: string; className: string } {
  if (row.deployedReplyPostId) {
    return { label: "Replied: deployed", className: "bg-primary/15 text-primary border-primary/40" };
  }
  if (row.replyPostId) {
    return { label: "Replied", className: "bg-secondary text-secondary-foreground border-border" };
  }
  if (row.status === "DEPLOYED") {
    return { label: "Reply pending", className: "bg-accent/15 text-accent-foreground border-accent/40" };
  }
  return { label: "No reply", className: "bg-muted text-muted-foreground border-border" };
}

function LaunchCard({ row }: { row: PublicLaunchRow }) {
  const isLaunch = row.symbol != null;
  return (
    <article className="rounded-md border-2 border-border bg-card p-4 shadow-[4px_4px_0_0_hsl(var(--border))]">
      <div className="flex flex-wrap items-center gap-2">
        {isLaunch ? (
          <span className="font-display text-lg leading-none">${row.symbol}</span>
        ) : (
          <span className="font-display text-lg leading-none text-muted-foreground">Not a launch call</span>
        )}
        {row.name && row.name !== row.symbol && (
          <span className="font-body text-sm text-muted-foreground">{row.name}</span>
        )}
        <span className={`ml-auto rounded-sm border px-2 py-0.5 font-mono text-[11px] uppercase ${statusStyle(row.status)}`}>
          {row.status}
        </span>
      </div>

      {row.tweetText && (
        <p className="mt-3 whitespace-pre-line rounded-sm bg-muted/60 p-3 font-body text-sm leading-relaxed text-foreground/90">
          {row.tweetText}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
        <span>@{row.xUsername}</span>
        <span>{new Date(row.createdAt).toLocaleString()}</span>
        {row.launchpad && <span>pad: {row.launchpad}</span>}
        {row.devBuy != null && <span>dev buy: {row.devBuy ? "on" : "off"}</span>}
        {row.ourblastFeePercent != null && <span>OurBlast fee: {row.ourblastFeePercent}% of creator fee</span>}
      </div>

      {row.notice && <p className="mt-2 font-body text-sm text-muted-foreground">{row.notice}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={tweetUrl(row)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 font-mono text-xs hover:bg-muted"
        >
          Tweet <ExternalLink className="h-3 w-3" />
        </a>
        {row.replyPostId && (
          <a
            href={`https://x.com/ourblastbot/status/${row.replyPostId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 font-mono text-xs hover:bg-muted"
          >
            Bot reply <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {row.txDigest && (
          <a
            href={`https://suivision.xyz/txblock/${row.txDigest}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 font-mono text-xs hover:bg-muted"
          >
            Tx {row.txDigest.slice(0, 8)}… <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {row.tokenUrl && (
          <a
            href={row.tokenUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-2 py-1 font-mono text-xs text-primary hover:bg-primary/20"
          >
            Token <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {row.poolUrl && (
          <a
            href={row.poolUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-2 py-1 font-mono text-xs text-primary hover:bg-primary/20"
          >
            Pool <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </article>
  );
}

function LaunchesPage() {
  const { data: rows } = useSuspenseQuery(launchesQuery);
  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle kicker="Public feed" title="Launch Status" />
      <p className="font-body text-sm text-muted-foreground">
        Every tweet <span className="font-mono">@ourblastbot</span> detected, what it parsed, and the confirmed
        on-chain result. A launch is only shown as deployed after Sui confirms it. Refreshes automatically. Call a
        launch by tweeting, then watch it land here — or open the{" "}
        <Link to="/terminal" className="underline underline-offset-2 hover:text-foreground">
          Terminal
        </Link>
        .
      </p>
      <div className="mt-6 space-y-4">
        {rows.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border-2 border-dashed border-border p-6 font-body text-sm text-muted-foreground">
            <Radio className="h-4 w-4" /> No launch calls detected yet.
          </div>
        ) : (
          rows.map((row) => <LaunchCard key={row.id} row={row} />)
        )}
      </div>
    </div>
  );
}
