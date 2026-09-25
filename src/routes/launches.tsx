import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Radio } from "lucide-react";
import { toast } from "sonner";

import { SectionTitle } from "@/components/blast/AppShell";
import { useBlast } from "@/components/blast/session";
import { runBankCommand } from "@/lib/terminal/bank.functions";
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

function LaunchTradePanel({ row }: { row: PublicLaunchRow }) {
  const { userId, ready } = useBlast();
  const run = useServerFn(runBankCommand);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastReply, setLastReply] = useState<string | null>(null);

  if (!row.tokenAddress) return null;

  const submit = async () => {
    const amt = amount.trim();
    const coin = row.tokenAddress!;
    let text: string;
    if (side === "buy") {
      const sui = Number(amt);
      if (!Number.isFinite(sui) || sui <= 0) {
        toast.error("Enter how much SUI to spend, e.g. 0.5");
        return;
      }
      text = `buy ${coin} with ${sui} sui`;
    } else {
      const isPct = amt.endsWith("%");
      const n = Number(isPct ? amt.slice(0, -1) : amt);
      if (!Number.isFinite(n) || n <= 0 || (isPct && n > 100)) {
        toast.error("Enter how much to sell, e.g. 50% or 1000");
        return;
      }
      text = `sell ${amt} ${coin}`;
    }
    setBusy(true);
    try {
      const result = await run({ data: { text } });
      setLastReply(result.reply);
      if (result.swapId) {
        toast("Trade ready — approve it in the Trade wallet list on the Terminal page.");
      } else if (/confirmed|done|bought|sold/i.test(result.reply)) {
        toast.success(result.reply);
      } else {
        toast(result.reply);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The trade could not be started.");
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return null;
  if (!userId) {
    return (
      <p className="mt-3 rounded-sm border border-dashed border-border p-2 font-body text-xs text-muted-foreground">
        Sign in on the <Link to="/terminal" className="underline underline-offset-2 hover:text-foreground">Terminal</Link> to buy or sell ${row.symbol} right here.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-sm border border-border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase text-muted-foreground">Trade ${row.symbol}</span>
        <button
          type="button"
          onClick={() => setSide("buy")}
          className={`rounded-sm border px-2 py-0.5 font-mono text-[11px] uppercase ${side === "buy" ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => setSide("sell")}
          className={`rounded-sm border px-2 py-0.5 font-mono text-[11px] uppercase ${side === "sell" ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
        >
          Sell
        </button>
        <input
          className="w-32 rounded-sm border border-border bg-background px-2 py-0.5 font-mono text-xs"
          placeholder={side === "buy" ? "SUI, e.g. 0.5" : "50% or 1000"}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
        />
        <button
          type="button"
          disabled={busy || !amount.trim()}
          onClick={() => void submit()}
          className="rounded-sm border-2 border-primary bg-primary/15 px-3 py-0.5 font-mono text-[11px] uppercase text-primary hover:bg-primary/25 disabled:opacity-50"
        >
          {busy ? "Working…" : side === "buy" ? "Buy now" : "Sell now"}
        </button>
      </div>
      <p className="mt-1 font-body text-[11px] text-muted-foreground">
        Same engine as tweeting the bot — uses your chosen trade wallet (OurBank = instant, your own wallet = you approve on the Terminal page).
      </p>
      {lastReply ? <p className="mt-1 font-body text-xs text-foreground/90">{lastReply}</p> : null}
    </div>
  );
}

function LaunchCard({ row }: { row: PublicLaunchRow }) {
  const isLaunch = row.symbol != null;
  const reply = replyState(row);
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
        <span className={`rounded-sm border px-2 py-0.5 font-mono text-[11px] uppercase ${reply.className}`}>
          {reply.label}
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

      {row.status === "DEPLOYED" && <LaunchTradePanel row={row} />}
    </article>
  );
}

const FILTERS = ["All", "Deployed", "In progress", "Failed", "Not a launch"] as const;
type Filter = (typeof FILTERS)[number];

function matchesFilter(row: PublicLaunchRow, filter: Filter): boolean {
  if (filter === "All") return true;
  if (filter === "Not a launch") return row.symbol == null;
  if (row.symbol == null) return false;
  if (filter === "Deployed") return row.status === "DEPLOYED";
  if (filter === "Failed") return row.status === "FAILED" || row.status === "UNAVAILABLE";
  return row.status !== "DEPLOYED" && row.status !== "FAILED" && row.status !== "UNAVAILABLE";
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border-2 border-border bg-card p-3 shadow-[4px_4px_0_0_hsl(var(--border))]">
      <div className="font-display text-2xl leading-none">{value}</div>
      <div className="mt-1 font-mono text-[11px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}

function LaunchesPage() {
  const { data: rows } = useSuspenseQuery(launchesQuery);
  const [filter, setFilter] = useState<Filter>("All");

  const stats = useMemo(() => {
    const launches = rows.filter((r) => r.symbol != null);
    return {
      tweets: rows.length,
      launches: launches.length,
      deployed: launches.filter((r) => r.status === "DEPLOYED").length,
      replied: rows.filter((r) => r.replyPostId || r.deployedReplyPostId).length,
    };
  }, [rows]);

  const visible = useMemo(() => rows.filter((row) => matchesFilter(row, filter)), [rows, filter]);

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle kicker="Public feed" title="Launch Activity" />
      <p className="font-body text-sm text-muted-foreground">
        Every tweet <span className="font-mono">@ourblastbot</span> detected, the ticker it parsed, the on-chain
        result and whether the bot replied. A launch is only shown as deployed after Sui confirms it. Refreshes
        automatically. Call a launch by tweeting, then watch it land here — or open the{" "}
        <Link to="/terminal" className="underline underline-offset-2 hover:text-foreground">
          Terminal
        </Link>
        .
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tweets seen" value={stats.tweets} />
        <Stat label="Launch calls" value={stats.launches} />
        <Stat label="Deployed" value={stats.deployed} />
        <Stat label="Bot replies" value={stats.replied} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-sm border-2 px-3 py-1 font-mono text-xs uppercase transition-colors ${
              filter === f
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {visible.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border-2 border-dashed border-border p-6 font-body text-sm text-muted-foreground">
            <Radio className="h-4 w-4" />{" "}
            {rows.length === 0 ? "No launch calls detected yet." : "Nothing matches this filter yet."}
          </div>
        ) : (
          visible.map((row) => <LaunchCard key={row.id} row={row} />)
        )}
      </div>
    </div>
  );
}
