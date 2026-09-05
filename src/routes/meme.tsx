import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { SectionTitle } from "@/components/blast/AppShell";
import { useBlast } from "@/components/blast/session";
import { supabase } from "@/integrations/supabase/client";
import { formatNumber } from "@/lib/blast";
import { getTodaysBattle, submitMeme, voteMeme } from "@/lib/community.functions";

export const Route = createFileRoute("/meme")({
  head: () => ({
    meta: [
      { title: "Meme Battle — Vote on the Best Blast Memes | OURBLAST" },
      {
        name: "description",
        content:
          "Two memes enter, one wins. Vote in today's Blast meme battle, submit your own and earn BLAST POINTS for taking part.",
      },
      { property: "og:title", content: "OURBLAST Meme Battle" },
      {
        property: "og:description",
        content: "Daily head-to-head meme voting for the Blast community.",
      },
    ],
  }),
  component: MemePage,
});

function MemePage() {
  const { userId, connect, refresh } = useBlast();
  const queryClient = useQueryClient();
  const vote = useServerFn(voteMeme);
  const submit = useServerFn(submitMeme);

  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const battle = useQuery({ queryKey: ["battle", "today"], queryFn: () => getTodaysBattle() });

  const myVote = useQuery({
    queryKey: ["my-vote", battle.data?.id, userId],
    enabled: Boolean(battle.data?.id && userId),
    queryFn: async () => {
      const { data } = await supabase
        .from("meme_votes")
        .select("meme_id")
        .eq("battle_id", battle.data!.id)
        .eq("user_id", userId!)
        .maybeSingle();
      return data;
    },
  });

  const mine = useQuery({
    queryKey: ["my-memes", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data } = await supabase
        .from("memes")
        .select("id, title, image_url, status, created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const voteMutation = useMutation({
    mutationFn: (memeId: string) => vote({ data: { battleId: battle.data!.id, memeId } }),
    onSuccess: (res) => {
      toast.success("Vote locked in", {
        description: res.pointsEarned ? `+${res.pointsEarned} points` : undefined,
      });
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["battle"] });
    },
    onError: (error) =>
      toast.error("Vote failed", {
        description: error instanceof Error ? error.message : "Try again.",
      }),
  });

  const submitMutation = useMutation({
    mutationFn: () => submit({ data: { title: title.trim(), imageUrl: imageUrl.trim() } }),
    onSuccess: (res) => {
      setTitle("");
      setImageUrl("");
      toast.success("Meme submitted for review", {
        description: res.pointsEarned ? `+${res.pointsEarned} points` : undefined,
      });
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["my-memes"] });
    },
    onError: (error) =>
      toast.error("Could not submit", {
        description: error instanceof Error ? error.message : "Check the image link.",
      }),
  });

  const voted = myVote.data?.meme_id ?? null;

  return (
    <div className="space-y-10">
      <div>
        <p className="font-body text-xs font-bold tracking-[0.22em] text-cyber uppercase">
          Meme battle
        </p>
        <h1 className="mt-1 font-display text-4xl sm:text-5xl">Two memes. One winner.</h1>
        <p className="mt-3 max-w-xl font-body text-muted-foreground">
          A fresh head-to-head every day. Vote once, earn points, and drop your own entries into the
          pool for tomorrow.
        </p>
      </div>

      {battle.data ? (
        <div className="grid gap-5 sm:grid-cols-2">
          {[battle.data.a, battle.data.b].map((m) => {
            const total = battle.data!.a.votes + battle.data!.b.votes;
            const share = total ? Math.round((m.votes / total) * 100) : 0;
            const isChoice = voted === m.id;
            return (
              <div
                key={m.id}
                className={`panel overflow-hidden ${isChoice ? "glow-blast" : ""}`}
              >
                <img
                  src={m.image_url}
                  alt={m.title}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
                <div className="p-5">
                  <p className="font-display text-xl">{m.title}</p>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-cyber" style={{ width: `${share}%` }} />
                  </div>
                  <p className="mt-2 font-body text-sm text-muted-foreground">
                    {formatNumber(m.votes)} votes · {share}%
                  </p>
                  <button
                    type="button"
                    disabled={Boolean(voted) || voteMutation.isPending}
                    onClick={() => (userId ? voteMutation.mutate(m.id) : void connect())}
                    className="mt-4 w-full rounded-full bg-primary px-5 py-2.5 font-display tracking-wide text-primary-foreground uppercase disabled:opacity-50"
                  >
                    {isChoice ? "Your pick" : voted ? "Voted" : userId ? "Vote" : "Connect to vote"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="panel p-6 font-body text-muted-foreground">
          No battle running yet. Once two memes are approved, today's matchup starts automatically.
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="panel p-5 sm:p-6">
          <SectionTitle kicker="Submit" title="Enter a meme" />
          <div className="space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Caption or title"
              maxLength={80}
              className="w-full rounded-xl border border-input bg-background/60 px-4 py-3 font-body outline-none focus:border-ring"
            />
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://link-to-your-image.png"
              className="w-full rounded-xl border border-input bg-background/60 px-4 py-3 font-body outline-none focus:border-ring"
            />
            <button
              type="button"
              disabled={submitMutation.isPending || title.trim().length < 2 || !imageUrl.trim()}
              onClick={() => (userId ? submitMutation.mutate() : void connect())}
              className="w-full rounded-full bg-accent px-5 py-3 font-display tracking-wide text-accent-foreground uppercase disabled:opacity-50"
            >
              {userId ? "Submit meme" : "Connect to submit"}
            </button>
            <p className="font-body text-xs text-muted-foreground">
              Entries are reviewed before they go into battle. Keep it funny, keep it legal.
            </p>
          </div>
        </div>

        <div className="panel p-5 sm:p-6">
          <SectionTitle kicker="Your entries" title="Submission status" />
          {(mine.data ?? []).length === 0 ? (
            <p className="font-body text-muted-foreground">Nothing submitted yet.</p>
          ) : (
            <ul className="space-y-3">
              {(mine.data ?? []).map((m) => (
                <li key={m.id} className="flex items-center gap-3">
                  <img
                    src={m.image_url}
                    alt={m.title}
                    loading="lazy"
                    className="size-12 rounded-xl border border-border object-cover"
                  />
                  <span className="flex-1 font-body text-sm">{m.title}</span>
                  <span
                    className={`font-body text-xs font-bold uppercase ${
                      m.status === "approved"
                        ? "text-lime"
                        : m.status === "rejected"
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }`}
                  >
                    {m.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
