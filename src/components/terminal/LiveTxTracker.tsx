// SPDX-License-Identifier: BUSL-1.1
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";

import { getTxStatus } from "@/lib/terminal/tx-status.functions";

/** Polls real stored chain state for a bridge/launch started from chat and shows each step live. */
export function LiveTxTracker({ kind, since }: { kind: "suiout" | "launch" | "evm"; since: string }) {
  const fn = useServerFn(getTxStatus);
  const q = useQuery({
    queryKey: ["tx-status", kind, since],
    queryFn: () => fn({ data: { kind, since } }),
    refetchInterval: (query) => {
      if (query.state.data?.final) return false;
      // Stop polling after 2h; the user can rerun "bridge status".
      return Date.now() - Date.parse(since) > 7_200_000 ? false : 6_000;
    },
  });
  if (!q.data) return <div className="mt-2 text-xs text-muted-foreground">Loading live status…</div>;
  return (
    <div className="mt-3 max-w-xl border border-border p-3 text-sm">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        {q.data.final ? null : <span className="size-2 animate-pulse rounded-full bg-primary" />}
        {q.data.final ? "Finished" : "Live — updates every few seconds"}
      </div>
      <ol className="space-y-2">
        {q.data.steps.map((s) => (
          <li key={s.label} className="flex gap-2">
            {s.state === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> : s.state === "fail" ? <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" /> : s.state === "run" ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
            <div className="min-w-0">
              <div className="font-medium">{s.label}</div>
              {s.detail ? <div className={`break-words text-xs ${s.state === "fail" ? "text-destructive" : "text-muted-foreground"}`}>{s.detail}</div> : null}
              {s.href ? <a href={s.href} target="_blank" rel="noreferrer" className="text-xs text-primary underline">View on {s.linkText}</a> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
