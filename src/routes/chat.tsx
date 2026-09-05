import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PlayerAvatar, PlayerName } from "@/components/blast/PlayerBadge";
import { useBlast } from "@/components/blast/session";
import { supabase } from "@/integrations/supabase/client";
import { timeAgo } from "@/lib/blast";
import { awardChatPoints } from "@/lib/community.functions";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Community Chat — Blast Holders Live Feed | OURBLAST" },
      {
        name: "description",
        content:
          "Wallet-verified live chat for the Blast community. React to messages, mute the noise and earn BLAST POINTS for joining in.",
      },
      { property: "og:title", content: "OURBLAST Community Chat" },
      {
        property: "og:description",
        content: "Wallet-verified live chat for the Blast community.",
      },
    ],
  }),
  component: ChatPage,
});

const REACTIONS = ["🔥", "💥", "😂", "🚀"];

type Message = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
};

function ChatPage() {
  const { userId, profile, connect } = useBlast();
  const queryClient = useQueryClient();
  const award = useServerFn(awardChatPoints);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listEnd = useRef<HTMLDivElement>(null);

  const messages = useQuery({
    queryKey: ["chat", "messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, user_id, body, created_at")
        .eq("is_deleted", false)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  const authorIds = [...new Set((messages.data ?? []).map((m) => m.user_id))];
  const authors = useQuery({
    queryKey: ["chat", "authors", authorIds.length],
    enabled: authorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, wallet_address, nickname")
        .in("id", authorIds);
      return data ?? [];
    },
  });

  const reactions = useQuery({
    queryKey: ["chat", "reactions"],
    queryFn: async () => {
      const { data } = await supabase.from("chat_reactions").select("message_id, emoji, user_id");
      return data ?? [];
    },
  });

  const blocks = useQuery({
    queryKey: ["chat", "blocks", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data } = await supabase
        .from("user_blocks")
        .select("blocked_user_id")
        .eq("user_id", userId!);
      return (data ?? []).map((b) => b.blocked_user_id);
    },
  });

  // Live updates
  useEffect(() => {
    const channel = supabase
      .channel("blast-chat")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["chat", "messages"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reactions" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["chat", "reactions"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: "end" });
  }, [messages.data]);

  const muted = profile?.muted_until ? new Date(profile.muted_until) > new Date() : false;

  const send = async () => {
    const body = draft.trim();
    if (!body || !userId) return;
    setSending(true);
    try {
      const { error } = await supabase.from("chat_messages").insert({ user_id: userId, body });
      if (error) throw new Error(error.message.includes("rate") ? "Slow down a second." : error.message);
      setDraft("");
      const res = await award({});
      if (res.pointsEarned > 0) toast.success(`+${res.pointsEarned} points for the noise`);
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    } catch (error) {
      toast.error("Message not sent", {
        description: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setSending(false);
    }
  };

  const react = async (messageId: string, emoji: string) => {
    if (!userId) return void connect();
    const existing = (reactions.data ?? []).find(
      (r) => r.message_id === messageId && r.emoji === emoji && r.user_id === userId,
    );
    if (existing) {
      await supabase
        .from("chat_reactions")
        .delete()
        .eq("message_id", messageId)
        .eq("emoji", emoji)
        .eq("user_id", userId);
    } else {
      await supabase.from("chat_reactions").insert({ message_id: messageId, emoji, user_id: userId });
    }
    void queryClient.invalidateQueries({ queryKey: ["chat", "reactions"] });
  };

  const block = async (targetId: string) => {
    if (!userId) return;
    await supabase.from("user_blocks").insert({ user_id: userId, blocked_user_id: targetId });
    toast("Hidden. You won't see their messages.");
    void queryClient.invalidateQueries({ queryKey: ["chat", "blocks"] });
  };

  const visible = (messages.data ?? []).filter(
    (m) => !(blocks.data ?? []).includes(m.user_id),
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="font-body text-xs font-bold tracking-[0.22em] text-cyber uppercase">
          Community
        </p>
        <h1 className="mt-1 font-display text-4xl sm:text-5xl">Blast chat</h1>
        <p className="mt-3 max-w-xl font-body text-muted-foreground">
          Every message is signed by a wallet. First 20 messages a day earn points.
        </p>
      </div>

      <div className="panel flex h-[62vh] flex-col overflow-hidden">
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
          {visible.length === 0 ? (
            <p className="font-body text-muted-foreground">No messages yet. Break the silence.</p>
          ) : (
            visible.map((m) => {
              const author = (authors.data ?? []).find((a) => a.id === m.user_id);
              const mine = m.user_id === userId;
              return (
                <div key={m.id} className="group flex items-start gap-3">
                  <PlayerAvatar address={author?.wallet_address ?? "0x0"} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-xs text-muted-foreground">
                      <PlayerName
                        address={author?.wallet_address ?? "0x0"}
                        nickname={author?.nickname ?? null}
                        className="text-foreground"
                      />{" "}
                      · {timeAgo(m.created_at)}
                    </p>
                    <p className="font-body break-words">{m.body}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {REACTIONS.map((emoji) => {
                        const count = (reactions.data ?? []).filter(
                          (r) => r.message_id === m.id && r.emoji === emoji,
                        ).length;
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => void react(m.id, emoji)}
                            className={`rounded-full border border-border px-2 py-0.5 font-body text-xs transition-colors hover:bg-secondary ${
                              count ? "bg-secondary/60" : "opacity-0 group-hover:opacity-100"
                            }`}
                          >
                            {emoji} {count || ""}
                          </button>
                        );
                      })}
                      {!mine && userId ? (
                        <button
                          type="button"
                          onClick={() => void block(m.user_id)}
                          className="ml-1 font-body text-[0.65rem] text-muted-foreground opacity-0 uppercase group-hover:opacity-100 hover:text-destructive"
                        >
                          Hide
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={listEnd} />
        </div>

        <div className="border-t border-border p-3 sm:p-4">
          {!userId ? (
            <button
              type="button"
              onClick={() => void connect()}
              className="glow-blast w-full rounded-full bg-primary px-5 py-3 font-display tracking-wide text-primary-foreground uppercase"
            >
              Connect to chat
            </button>
          ) : muted ? (
            <p className="py-2 text-center font-body text-sm text-destructive">
              You're muted until {new Date(profile!.muted_until!).toLocaleString()}.
            </p>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Say something loud…"
                maxLength={400}
                className="flex-1 rounded-full border border-input bg-background/60 px-5 py-3 font-body outline-none focus:border-ring"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="rounded-full bg-primary px-6 py-3 font-display tracking-wide text-primary-foreground uppercase disabled:opacity-50"
              >
                Send
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
