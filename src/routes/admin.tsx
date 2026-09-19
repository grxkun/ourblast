import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { SectionTitle } from "@/components/blast/AppShell";
import { PlayerAvatar } from "@/components/blast/PlayerBadge";
import { useBlast } from "@/components/blast/session";
import { formatNumber, shortAddress, timeAgo } from "@/lib/blast";
import {
  adjustPoints,
  adminOverview,
  amIStaff,
  hideMessage,
  reviewMeme,
  setBanned,
  setMuted,
  upsertChallenge,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Moderation & Points Control | OURBLAST" },
      {
        name: "description",
        content: "Staff-only control room for OURBLAST: players, scores, chat, memes and points.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "OURBLAST Admin" },
      { property: "og:description", content: "Staff-only control room." },
    ],
  }),
  component: AdminPage,
});

type Tab = "players" | "scores" | "chat" | "memes" | "challenge" | "log";

const TABS: { key: Tab; label: string }[] = [
  { key: "players", label: "Players" },
  { key: "scores", label: "Scores" },
  { key: "chat", label: "Chat" },
  { key: "memes", label: "Memes" },
  { key: "challenge", label: "Challenge" },
  { key: "log", label: "Audit log" },
];

function AdminPage() {
  const { userId, connect } = useBlast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("players");

  const staffCheck = useServerFn(amIStaff);
  const overviewFn = useServerFn(adminOverview);
  const adjust = useServerFn(adjustPoints);
  const ban = useServerFn(setBanned);
  const mute = useServerFn(setMuted);
  const hide = useServerFn(hideMessage);
  const review = useServerFn(reviewMeme);
  const challengeFn = useServerFn(upsertChallenge);

  const staff = useQuery({
    queryKey: ["staff", userId],
    enabled: Boolean(userId),
    queryFn: () => staffCheck({}),
  });

  const overview = useQuery({
    queryKey: ["admin-overview"],
    enabled: Boolean(staff.data?.staff),
    queryFn: () => overviewFn({}),
  });

  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
  };

  const act = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      toast.success("Done");
      reload();
    },
    onError: (error) =>
      toast.error("Action failed", {
        description: error instanceof Error ? error.message : "Try again.",
      }),
  });

  const [challengeForm, setChallengeForm] = useState({
    title: "",
    description: "",
    target: 60,
    rewardPoints: 500,
  });

  if (!userId) {
    return (
      <div className="panel mx-auto max-w-md p-8 text-center">
        <h1 className="font-display text-3xl">Staff only</h1>
        <p className="mt-3 font-body text-muted-foreground">Connect a wallet with staff access.</p>
        <button
          type="button"
          onClick={() => void connect()}
          className="glow-blast mt-6 rounded-full bg-primary px-8 py-3 font-display tracking-wide text-primary-foreground uppercase"
        >
          Connect
        </button>
      </div>
    );
  }

  if (staff.isLoading) {
    return <p className="font-body text-muted-foreground">Checking access…</p>;
  }

  if (!staff.data?.staff) {
    return (
      <div className="panel mx-auto max-w-md p-8 text-center">
        <h1 className="font-display text-3xl">No entry</h1>
        <p className="mt-3 font-body text-muted-foreground">
          This wallet doesn't have moderator or admin access.
        </p>
      </div>
    );
  }

  const data = overview.data;

  return (
    <div className="space-y-8">
      <div>
        <p className="font-body text-xs font-bold tracking-[0.22em] text-cyber uppercase">Staff</p>
        <h1 className="mt-1 font-display text-4xl">Control room</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full px-5 py-2 font-display text-sm tracking-wide uppercase ${
              tab === t.key
                ? "glow-blast bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {overview.isLoading || !data ? (
        <p className="font-body text-muted-foreground">Loading control room…</p>
      ) : tab === "players" ? (
        <div className="panel divide-y divide-border">
          {data.players.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 p-4">
              <PlayerAvatar address={p.wallet_address ?? p.id} size={36} />
              <div className="min-w-0 flex-1">
                <p className="font-body font-semibold">
                  {p.nickname?.trim() || (p.wallet_address ? shortAddress(p.wallet_address) : "Social player")}
                  {p.is_banned ? <span className="ml-2 text-xs text-destructive">BANNED</span> : null}
                </p>
                <p className="font-body text-xs text-muted-foreground">
                  {formatNumber(p.points)} pts · best {formatNumber(p.best_score)} ·{" "}
                  {formatNumber(p.games_played)} games
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full border border-border px-3 py-1.5 font-body text-xs uppercase"
                  onClick={() => {
                    const raw = window.prompt("Points adjustment (e.g. 500 or -250)");
                    if (!raw) return;
                    const amount = Number(raw);
                    if (!Number.isInteger(amount) || amount === 0) return;
                    const reason = window.prompt("Reason for the audit log") ?? "";
                    if (reason.trim().length < 3) return;
                    act.mutate(() => adjust({ data: { userId: p.id, amount, reason } }));
                  }}
                >
                  Points
                </button>
                <button
                  type="button"
                  className="rounded-full border border-border px-3 py-1.5 font-body text-xs uppercase"
                  onClick={() => {
                    const raw = window.prompt("Mute for how many minutes? (0 to unmute)", "60");
                    if (raw === null) return;
                    act.mutate(() => mute({ data: { userId: p.id, minutes: Number(raw) || 0 } }));
                  }}
                >
                  {p.muted_until && new Date(p.muted_until) > new Date() ? "Muted" : "Mute"}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-destructive px-3 py-1.5 font-body text-xs text-destructive uppercase"
                  onClick={() =>
                    act.mutate(() =>
                      ban({ data: { userId: p.id, banned: !p.is_banned, reason: "staff action" } }),
                    )
                  }
                >
                  {p.is_banned ? "Unban" : "Ban"}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : tab === "scores" ? (
        <div className="panel divide-y divide-border">
          {data.sessions.map((s) => {
            const player = data.players.find((p) => p.id === s.user_id);
            return (
              <div key={s.id} className="flex items-center gap-3 p-4 font-body text-sm">
                <span className="flex-1">
                  {player?.nickname?.trim() || shortAddress(player?.wallet_address ?? "0x0")}
                </span>
                <span className="text-muted-foreground">{s.clicks} hits</span>
                <span className="font-display text-lg text-lime">{formatNumber(s.score)}</span>
                <span className="w-12 text-right text-xs text-muted-foreground">
                  {timeAgo(s.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      ) : tab === "chat" ? (
        <div className="panel divide-y divide-border">
          {data.messages.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-4 font-body text-sm">
              <span className={`flex-1 ${m.is_deleted ? "line-through opacity-50" : ""}`}>
                {m.body}
              </span>
              <span className="text-xs text-muted-foreground">{timeAgo(m.created_at)}</span>
              {!m.is_deleted ? (
                <button
                  type="button"
                  onClick={() => act.mutate(() => hide({ data: { messageId: m.id } }))}
                  className="rounded-full border border-destructive px-3 py-1.5 text-xs text-destructive uppercase"
                >
                  Hide
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : tab === "memes" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.memes.map((m) => (
            <div key={m.id} className="panel overflow-hidden">
              <img
                src={m.image_url}
                alt={m.title}
                loading="lazy"
                className="aspect-square w-full object-cover"
              />
              <div className="space-y-3 p-4">
                <p className="font-display text-lg">{m.title}</p>
                <p className="font-body text-xs uppercase text-muted-foreground">{m.status}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      act.mutate(() => review({ data: { memeId: m.id, status: "approved" } }))
                    }
                    className="flex-1 rounded-full bg-primary px-3 py-2 font-display text-xs tracking-wide text-primary-foreground uppercase"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      act.mutate(() => review({ data: { memeId: m.id, status: "rejected" } }))
                    }
                    className="flex-1 rounded-full border border-destructive px-3 py-2 font-display text-xs tracking-wide text-destructive uppercase"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : tab === "challenge" ? (
        <div className="panel max-w-xl space-y-3 p-5 sm:p-6">
          <SectionTitle kicker="Today" title="Set the challenge" />
          <input
            value={challengeForm.title}
            onChange={(e) => setChallengeForm({ ...challengeForm, title: e.target.value })}
            placeholder="Challenge title"
            className="w-full rounded-xl border border-input bg-background/60 px-4 py-3 font-body outline-none focus:border-ring"
          />
          <textarea
            value={challengeForm.description}
            onChange={(e) => setChallengeForm({ ...challengeForm, description: e.target.value })}
            placeholder="What players have to do"
            rows={3}
            className="w-full resize-none rounded-xl border border-input bg-background/60 px-4 py-3 font-body outline-none focus:border-ring"
          />
          <div className="flex gap-3">
            <label className="flex-1 font-body text-xs uppercase text-muted-foreground">
              Target hits
              <input
                type="number"
                value={challengeForm.target}
                onChange={(e) =>
                  setChallengeForm({ ...challengeForm, target: Number(e.target.value) })
                }
                className="mt-1 w-full rounded-xl border border-input bg-background/60 px-4 py-2.5 font-body outline-none focus:border-ring"
              />
            </label>
            <label className="flex-1 font-body text-xs uppercase text-muted-foreground">
              Reward points
              <input
                type="number"
                value={challengeForm.rewardPoints}
                onChange={(e) =>
                  setChallengeForm({ ...challengeForm, rewardPoints: Number(e.target.value) })
                }
                className="mt-1 w-full rounded-xl border border-input bg-background/60 px-4 py-2.5 font-body outline-none focus:border-ring"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => act.mutate(() => challengeFn({ data: challengeForm }))}
            className="w-full rounded-full bg-primary px-6 py-3 font-display tracking-wide text-primary-foreground uppercase"
          >
            Save challenge
          </button>
        </div>
      ) : (
        <div className="panel divide-y divide-border">
          {data.actions.map((a) => (
            <div key={a.id} className="flex items-center gap-3 p-4 font-body text-sm">
              <span className="flex-1">
                {a.action}
                {a.reason ? <span className="text-muted-foreground"> · {a.reason}</span> : null}
              </span>
              <span className="text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
