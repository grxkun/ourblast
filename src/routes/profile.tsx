import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SectionTitle } from "@/components/blast/AppShell";
import { MyTokensCard } from "@/components/blast/MyTokensCard";
import { PlayerAvatar } from "@/components/blast/PlayerBadge";
import { useBlast } from "@/components/blast/session";
import { supabase } from "@/integrations/supabase/client";
import { formatNumber, playerAvatarSeed, playerLabel, timeAgo } from "@/lib/blast";
import { fetchSuiBalance, formatSui } from "@/lib/sui-balance";
import { amIStaff } from "@/lib/admin.functions";
import { getMyBankWallet } from "@/lib/terminal/bank.functions";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your Player Card — Points, Rank & Achievements | OURBLAST" },
      {
        name: "description",
        content:
          "Your OURBLAST player card: BLAST POINTS balance, best score, login streak, achievements and recent point history.",
      },
      { property: "og:title", content: "OURBLAST Player Card" },
      {
        property: "og:description",
        content: "Track your points, streak, best score and achievements.",
      },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { profile, userId, connect, connecting, disconnect, refresh } = useBlast();
  const staffCheck = useServerFn(amIStaff);
  const bankWalletFn = useServerFn(getMyBankWallet);
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNickname(profile?.nickname ?? "");
  }, [profile?.nickname]);

  const staff = useQuery({
    queryKey: ["staff", userId],
    enabled: Boolean(userId),
    queryFn: () => staffCheck({}),
  });

  const bankWallet = useQuery({
    queryKey: ["bank-wallet", userId],
    enabled: Boolean(userId) && !profile?.wallet_address,
    queryFn: () => bankWalletFn({}),
  });

  const balance = useQuery({
    queryKey: ["sui-balance", profile?.wallet_address],
    enabled: Boolean(profile?.wallet_address),
    refetchInterval: 30_000,
    queryFn: () => fetchSuiBalance(profile!.wallet_address!),
  });

  const achievements = useQuery({
    queryKey: ["achievements", userId],
    queryFn: async () => {
      const [all, mine] = await Promise.all([
        supabase.from("achievements").select("*").order("sort_order"),
        userId
          ? supabase.from("user_achievements").select("achievement_key, earned_at").eq("user_id", userId)
          : Promise.resolve({ data: [] as { achievement_key: string; earned_at: string }[] }),
      ]);
      return (all.data ?? []).map((a) => ({
        ...a,
        earnedAt: (mine.data ?? []).find((m) => m.achievement_key === a.key)?.earned_at ?? null,
      }));
    },
  });

  const history = useQuery({
    queryKey: ["points-history", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data } = await supabase
        .from("points_transactions")
        .select("id, amount, reason, created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  if (!userId || !profile) {
    return (
      <div className="panel grid-noise mx-auto max-w-lg p-8 text-center">
        <span className="text-5xl" aria-hidden="true">
          👾
        </span>
        <h1 className="mt-4 font-display text-3xl">Your player card</h1>
        <p className="mt-3 font-body text-muted-foreground">
          Connect your Slush wallet to claim a card, bank points and appear on the leaderboard.
        </p>
        <button
          type="button"
          onClick={() => void connect()}
          disabled={connecting}
          className="glow-blast mt-6 rounded-full bg-primary px-8 py-3 font-display text-lg tracking-wide text-primary-foreground uppercase disabled:opacity-60"
        >
          {connecting ? "Connecting…" : "Connect Slush"}
        </button>
      </div>
    );
  }

  const saveNickname = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ nickname: nickname.trim() || null })
      .eq("id", userId);
    setSaving(false);
    if (error) toast.error("Could not save your name");
    else {
      toast.success("Nickname saved");
      refresh();
    }
  };

  return (
    <div className="space-y-10">
      <section className="panel flex flex-wrap items-center gap-4 p-5 sm:gap-5 sm:p-6">
        <PlayerAvatar address={playerAvatarSeed(profile)} size={64} className="glow-blast sm:size-[78px]" />
        <div className="min-w-0 flex-1 basis-40">
          <h1 className="font-display text-2xl sm:text-3xl">
            {playerLabel(profile)}
          </h1>
          <p className="mt-0.5 font-body text-[0.7rem] break-all text-muted-foreground sm:text-xs">
            {profile.wallet_address ??
              `Signed in with ${
                profile.auth_provider === "x"
                  ? "X"
                  : profile.auth_provider === "evm"
                    ? "EVM wallet (MetaMask / Rabby)"
                    : "Google"
              } · no wallet connected`}
          </p>
          {profile.wallet_address ? (
          <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 font-body text-xs">
            <span className="text-muted-foreground">Wallet balance</span>
            <span className="font-display text-sm text-lime">
              {balance.isLoading ? "…" : `${formatSui(balance.data ?? 0)} SUI`}
            </span>
          </p>
          ) : null}
          {!profile.wallet_address && bankWallet.data?.linked ? (
            <p className="mt-2 inline-flex flex-wrap items-center gap-2 rounded-full border border-border px-3 py-1 font-body text-xs">
              <span className="text-muted-foreground">OurBank wallet</span>
              <Link to="/terminal" className="font-display text-sm text-lime break-all">
                {bankWallet.data.address.slice(0, 10)}…{bankWallet.data.address.slice(-6)}
              </Link>
              <span className="text-muted-foreground">
                {bankWallet.data.balances.length === 0
                  ? "empty"
                  : bankWallet.data.balances
                      .slice(0, 3)
                      .map((b) => `${formatNumber(b.amount)} ${b.symbol}`)
                      .join(" · ")}
              </span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {staff.data?.staff ? (
            <Link
              to="/admin"
              className="rounded-full bg-accent px-5 py-2.5 font-display tracking-wide text-accent-foreground uppercase"
            >
              Admin
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void disconnect()}
            className="rounded-full border border-border px-5 py-2.5 font-display tracking-wide uppercase"
          >
            Disconnect
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Points", value: formatNumber(profile.points), tone: "text-lime" },
          { label: "Best score", value: formatNumber(profile.best_score), tone: "text-cyber" },
          { label: "Games", value: formatNumber(profile.games_played), tone: "" },
          { label: "Streak", value: `${profile.streak} 🔥`, tone: "text-primary" },
        ].map((s) => (
          <div key={s.label} className="panel p-5">
            <p className="font-body text-[0.62rem] font-bold tracking-[0.2em] text-muted-foreground uppercase">
              {s.label}
            </p>
            <p className={`mt-1 font-display text-2xl ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </section>

      <section className="panel p-5 sm:p-6">
        <SectionTitle kicker="Identity" title="Nickname" />
        <div className="flex flex-wrap gap-2">
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={playerLabel(profile)}
            maxLength={24}
            className="min-w-0 flex-1 rounded-xl border border-input bg-background/60 px-4 py-3 font-body outline-none focus:border-ring"
          />
          <button
            type="button"
            onClick={() => void saveNickname()}
            disabled={saving}
            className="rounded-full bg-primary px-6 py-3 font-display tracking-wide text-primary-foreground uppercase disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </section>

      <MyTokensCard />

      <section>
        <SectionTitle kicker="Achievements" title="Badge wall" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(achievements.data ?? []).map((a) => (
            <div
              key={a.key}
              className={`panel p-5 ${a.earnedAt ? "glow-cyber" : "opacity-55"}`}
            >
              <span className="text-3xl" aria-hidden="true">
                {a.icon}
              </span>
              <p className="mt-3 font-display text-xl">{a.title}</p>
              <p className="mt-1 font-body text-sm text-muted-foreground">{a.description}</p>
              <p className="mt-3 font-body text-xs text-lime">
                {a.earnedAt ? `Unlocked ${timeAgo(a.earnedAt)} ago` : `+${a.reward_points} points`}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel p-5 sm:p-6">
        <SectionTitle kicker="Ledger" title="Recent points" />
        {(history.data ?? []).length === 0 ? (
          <p className="font-body text-muted-foreground">No points yet — go play a round.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(history.data ?? []).map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2.5 font-body text-sm">
                <span className="capitalize">{t.reason.replace(/[_:]/g, " ")}</span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{timeAgo(t.created_at)}</span>
                  <span className={t.amount >= 0 ? "text-lime" : "text-destructive"}>
                    {t.amount >= 0 ? "+" : ""}
                    {formatNumber(t.amount)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
