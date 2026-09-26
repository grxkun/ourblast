import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { listXBlacklist, setXBlacklisted } from "@/lib/admin.functions";

export function XBlacklistCard() {
  const qc = useQueryClient();
  const listFn = useServerFn(listXBlacklist);
  const setFn = useServerFn(setXBlacklisted);
  const [username, setUsername] = useState("");
  const [reason, setReason] = useState("");
  const list = useQuery({ queryKey: ["x-blacklist"], queryFn: () => listFn({}) });
  const m = useMutation({
    mutationFn: (v: { username: string; blocked: boolean; reason?: string }) => setFn({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(v.blocked ? "Blacklisted" : "Removed from blacklist");
      setUsername("");
      setReason("");
      void qc.invalidateQueries({ queryKey: ["x-blacklist"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="panel p-5">
      <h3 className="font-display text-xl">X blacklist</h3>
      <p className="mt-1 font-body text-sm text-muted-foreground">
        The bot ignores every mention from these accounts — no launches, trades, sends, claims or replies.
      </p>
      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (username.trim()) m.mutate({ username, blocked: true, reason });
        }}
      >
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@handle or x.com link"
          className="min-w-40 flex-1 rounded-md border border-border bg-background px-3 py-2 font-body text-sm" />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason"
          className="min-w-40 flex-1 rounded-md border border-border bg-background px-3 py-2 font-body text-sm" />
        <button type="submit" disabled={m.isPending}
          className="rounded-md bg-destructive px-4 py-2 font-display text-sm uppercase text-destructive-foreground disabled:opacity-50">
          Blacklist
        </button>
      </form>
      <ul className="mt-4 divide-y divide-border">
        {(list.data ?? []).map((r) => (
          <li key={r.x_username} className="flex items-center justify-between gap-3 py-2 font-body text-sm">
            <span>
              <a href={`https://x.com/${r.x_username}`} target="_blank" rel="noreferrer" className="font-semibold underline">@{r.x_username}</a>
              {r.reason ? <span className="text-muted-foreground"> — {r.reason}</span> : null}
            </span>
            <button type="button" onClick={() => m.mutate({ username: r.x_username, blocked: false })}
              className="rounded-md border border-border px-3 py-1 text-xs uppercase">Remove</button>
          </li>
        ))}
        {list.data?.length === 0 && <li className="py-2 font-body text-sm text-muted-foreground">Nobody blacklisted.</li>}
      </ul>
    </div>
  );
}
