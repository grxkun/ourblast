import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, MessageSquareReply, Radar, Search } from "lucide-react";

import { botHealth } from "@/lib/admin.functions";
import { timeAgo } from "@/lib/blast";

function ageLabel(iso: string | null | undefined): { text: string; fresh: boolean } {
  if (!iso) return { text: "never", fresh: false };
  const ms = Date.now() - new Date(iso).getTime();
  return { text: timeAgo(iso), fresh: ms < 15 * 60_000 };
}

export function BotHealthCard() {
  const fetchHealth = useServerFn(botHealth);
  const health = useQuery({
    queryKey: ["bot-health"],
    queryFn: () => fetchHealth({}),
    refetchInterval: 60_000,
  });

  const state = health.data?.state ?? null;
  const rows = [
    { icon: Radar, name: "Mention poll", ...ageLabel(state?.last_poll_success_at) },
    { icon: Search, name: "Search fallback", ...ageLabel(state?.last_search_success_at) },
    { icon: MessageSquareReply, name: "Last reply posted", ...ageLabel(state?.last_reply_success_at) },
  ];

  return (
    <div className="panel space-y-3 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm font-bold uppercase tracking-wide">Bot health</h3>
      </div>
      {health.isLoading ? (
        <p className="font-body text-sm text-muted-foreground">Checking the bot…</p>
      ) : health.isError ? (
        <p className="font-body text-sm text-destructive">Could not load bot health.</p>
      ) : (
        <>
          <div className="divide-y divide-border rounded-xl border border-border">
            {rows.map((row) => (
              <div key={row.name} className="flex items-center justify-between px-4 py-2.5">
                <span className="flex items-center gap-2 font-body text-sm text-foreground">
                  <row.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {row.name}
                </span>
                <span
                  className={`font-body text-xs ${row.fresh ? "text-emerald-500" : "text-muted-foreground"}`}
                >
                  {row.fresh ? "● " : "○ "}
                  {row.text}
                </span>
              </div>
            ))}
          </div>
          <p className="font-body text-xs text-muted-foreground">
            Mentions seen in the last 24h: {health.data?.mentionsLast24h ?? 0} · failed replies
            awaiting retry: {health.data?.pendingFailedReplies ?? 0}
          </p>
          {state?.last_poll_error ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 font-body text-xs text-destructive">
              Last poll error: {state.last_poll_error}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
