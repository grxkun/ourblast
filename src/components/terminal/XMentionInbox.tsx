import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getXBotStatus, pollXMentionsNow, simulateXMention } from "@/lib/terminal/x-bot.functions";
import { enforceSingleCashtag, X_BOT_HANDLE } from "@/lib/terminal/x-bot";

export function XMentionInbox() {
  const [draft, setDraft] = useState(`${X_BOT_HANDLE} launch $DOG Sui Dog`);
  const queryClient = useQueryClient();
  const simulate = useServerFn(simulateXMention);
  const statusFn = useServerFn(getXBotStatus);
  const pollNow = useServerFn(pollXMentionsNow);

  const status = useQuery({ queryKey: ["x-bot-status"], queryFn: () => statusFn({}), staleTime: 60_000 });
  const live = Boolean(status.data?.live);

  const mentions = useQuery({
    queryKey: ["x-mentions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("x_mentions")
        .select("id, x_post_id, x_username, text, intent, status, reply_text, posted, reply_post_id, post_error, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const run = useMutation({
    mutationFn: async (text: string) => simulate({ data: { text, username: "ourblast_tester" } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["x-mentions"] });
      toast.success("Reply drafted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const poll = useMutation({
    mutationFn: async () => pollNow({}),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["x-mentions"] });
      void queryClient.invalidateQueries({ queryKey: ["x-launch-requests"] });
      if (result.error) toast.error(`X read failed: ${result.error}`);
      else if (result.reason) toast.info(result.reason);
      else toast.success(`Checked X: ${result.handled} new mention${result.handled === 1 ? "" : "s"}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold tracking-wide uppercase">{X_BOT_HANDLE} launch calls</h2>
        <Link to="/launches" className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground">
          Public launch status →
        </Link>
        {live ? <Badge>Live · replies posted to X</Badge> : <Badge variant="outline">Dry run · replies not posted</Badge>}
      </header>
      <p className="mb-3 text-xs text-muted-foreground">
        Tweets mentioning {X_BOT_HANDLE} run through the same parser and tools as this terminal. Replies are drafted and
        stored here; posting turns on automatically once the X account credentials are saved. Test mentions always stay a
        dry run.
      </p>
      <form
        className="mb-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim()) run.mutate(draft.trim());
        }}
      >
        <Input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={500} placeholder={`${X_BOT_HANDLE} launch $DOG Sui Dog`} />
        <Button type="submit" disabled={run.isPending}>
          <Send className="size-4" /> Test mention
        </Button>
        <Button type="button" variant="outline" disabled={poll.isPending} onClick={() => poll.mutate()}>
          <RefreshCw className={`size-4 ${poll.isPending ? "animate-spin" : ""}`} /> Check X now
        </Button>
      </form>
      <ul className="space-y-2">
        {(mentions.data ?? []).map((row) => (
          <li key={row.id} className="rounded-md border border-border/70 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">@{row.x_username}</span>
              <Badge variant="outline">{row.intent}</Badge>
              <Badge variant="outline">{row.status}</Badge>
              {row.posted ? <Badge>Posted</Badge> : <Badge variant="outline">Not posted</Badge>}
              {row.reply_post_id ? (
                <a
                  className="underline"
                  href={`https://x.com/${row.x_username}/status/${row.reply_post_id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View reply
                </a>
              ) : null}
            </div>
            <p className="mt-2 break-words">{row.text}</p>
            <p className="mt-2 break-words rounded bg-muted p-2 text-xs">
              {row.reply_text ? enforceSingleCashtag(row.reply_text) : ""}
            </p>
            {row.post_error ? <p className="mt-2 text-xs text-destructive">{row.post_error}</p> : null}
          </li>
        ))}
        {!mentions.isLoading && (mentions.data ?? []).length === 0 ? (
          <li className="text-xs text-muted-foreground">No launch calls yet.</li>
        ) : null}
      </ul>
    </section>
  );
}
