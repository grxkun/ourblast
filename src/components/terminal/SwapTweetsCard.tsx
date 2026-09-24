import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";

import { listSwapTweetsAdmin, runSwapTweetAdmin } from "@/lib/admin.functions";
import { timeAgo } from "@/lib/blast";

export function SwapTweetsCard() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listSwapTweetsAdmin);
  const run = useServerFn(runSwapTweetAdmin);
  const list = useQuery({ queryKey: ["swap-tweets"], queryFn: () => fetchList({}), refetchInterval: 30_000 });
  const mutation = useMutation({
    mutationFn: (postId: string) => run({ data: { postId } }),
    onSuccess: (r) => {
      toast.success(r.posted ? "Done — reply posted on X" : `Done${r.postError ? ` (reply not posted: ${r.postError})` : ""}`, { description: r.reply });
      qc.invalidateQueries({ queryKey: ["swap-tweets"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="panel mt-4 space-y-3 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <ArrowLeftRight className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm font-bold uppercase tracking-wide">Buy / sell tweets</h3>
      </div>
      <p className="font-body text-xs text-muted-foreground">
        Run a stuck or failed trade from its tweet. This is a real trade from the tweeter's OurBank wallet, and the bot replies on X.
      </p>
      {list.isLoading ? (
        <p className="font-body text-sm text-muted-foreground">Loading…</p>
      ) : !list.data?.length ? (
        <p className="font-body text-sm text-muted-foreground">No buy or sell tweets in the last 7 days.</p>
      ) : (
        <ul className="space-y-2">
          {list.data.map((m) => {
            const status = m.swap?.status ?? "NOT STARTED";
            const done = status === "CONFIRMED" || Boolean(m.swap?.tx_digest);
            return (
              <li key={m.x_post_id} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <a className="underline" href={`https://x.com/i/status/${m.x_post_id}`} target="_blank" rel="noreferrer">
                    @{m.x_username} · {timeAgo(m.created_at)}
                  </a>
                  <span className={done ? "text-primary" : status === "FAILED" ? "text-destructive" : ""}>{status}</span>
                </div>
                <p className="mt-1 break-all font-body text-sm">{m.text}</p>
                {m.swap?.error && <p className="mt-1 break-all text-xs text-muted-foreground">{m.swap.error}</p>}
                {!done && (
                  <button
                    className="btn-primary mt-2 text-xs"
                    disabled={mutation.isPending}
                    onClick={() => {
                      if (confirm(`Run this trade now for @${m.x_username}? Real SUI will be spent.`)) mutation.mutate(m.x_post_id);
                    }}
                  >
                    {mutation.isPending && mutation.variables === m.x_post_id ? "Running…" : "Run now"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
