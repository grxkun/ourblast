import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import mascotStand from "@/assets/mascot-stand.jpg.asset.json";
import { SectionTitle } from "@/components/blast/AppShell";
import { PlayerAvatar, PlayerName } from "@/components/blast/PlayerBadge";
import { useBlast } from "@/components/blast/session";
import { supabase } from "@/integrations/supabase/client";
import { formatNumber, timeAgo } from "@/lib/blast";
import { fetchLeaderboard } from "@/lib/leaderboard";
import { getTodaysBattle } from "@/lib/community.functions";

export const Route = createFileRoute("/hub")({
  head: () => ({
    meta: [
      { title: "OURBLAST — Blast Community Arcade, Points & Leaderboards" },
      {
        name: "description",
        content:
          "Play BLAST CLICK, climb the leaderboard, earn BLAST POINTS, battle memes and roast tokens. Connect your Slush wallet and join the Blast community arcade.",
      },
      { property: "og:title", content: "OURBLAST — Blast Community Arcade" },
      {
        property: "og:description",
        content:
          "Arcade games, daily challenges, leaderboards, meme battles and AI roasts for the Blast community.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { userId, connect, connecting, profile } = useBlast();

  const leaders = useQuery({
    queryKey: ["leaderboard", "today"],
    queryFn: () => fetchLeaderboard("today"),
  });

  const challenge = useQuery({
    queryKey: ["challenge", "today"],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_challenges")
        .select("title, description, target, reward_points")
        .eq("day", new Date().toISOString().slice(0, 10))
        .maybeSingle();
      return data;
    },
  });

  const battle = useQuery({ queryKey: ["battle", "today"], queryFn: () => getTodaysBattle() });

  const chat = useQuery({
    queryKey: ["chat", "peek"],
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id, body, created_at, user_id")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(3);
      const ids = [...new Set((data ?? []).map((m) => m.user_id))];
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, wallet_address, nickname").in("id", ids)
        : { data: [] };
      return (data ?? []).map((m) => ({
        ...m,
        author: (profiles ?? []).find((p) => p.id === m.user_id),
      }));
    },
  });

  return (
    <div className="space-y-14">
      {/* hero */}
      <section className="panel grid-noise animate-pop-in relative overflow-hidden px-5 py-10 sm:px-10 sm:py-14">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1.5 font-body text-[0.68rem] font-bold tracking-[0.2em] uppercase">
          <span className="size-2 animate-pulse rounded-full bg-lime" />
          Live · Blast community arcade
        </span>

        <h1 className="text-glow mt-6 font-display text-[clamp(2.9rem,10vw,6rem)] leading-[0.85]">
          Play. Climb.
          <br />
          <span className="text-primary">Blast off.</span>
        </h1>

        <p className="mt-5 max-w-xl font-body text-lg text-muted-foreground">
          A community-run arcade for Blast. Smash games, stack BLAST POINTS, fight for the top of
          the leaderboard, vote on memes and let the AI roast your favourite token.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/arcade"
            className="glow-blast rounded-full bg-primary px-8 py-3.5 font-display text-xl tracking-wide text-primary-foreground uppercase transition-transform hover:-translate-y-0.5"
          >
            Play now
          </Link>
          <Link
            to="/how-to-play"
            className="rounded-full border-2 border-border px-8 py-3.5 font-display text-xl tracking-wide uppercase transition-transform hover:-translate-y-0.5"
          >
            How to play
          </Link>
          {userId ? (
            <Link
              to="/profile"
              className="rounded-full bg-secondary px-8 py-3.5 font-display text-xl tracking-wide text-secondary-foreground uppercase transition-transform hover:-translate-y-0.5"
            >
              {formatNumber(profile?.points ?? 0)} points
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void connect()}
              disabled={connecting}
              className="glow-cyber rounded-full bg-accent px-8 py-3.5 font-display text-xl tracking-wide text-accent-foreground uppercase transition-transform hover:-translate-y-0.5 disabled:opacity-60"
            >
              {connecting ? "Connecting…" : "Connect Slush"}
            </button>
          )}
        </div>

        <img
          src={mascotStand.url}
          alt="OURBLAST helmet mascot standing confidently"
          width={220}
          height={220}
          className="pointer-events-none absolute -right-4 bottom-0 hidden w-40 rounded-3xl border-2 border-border object-cover lg:block xl:w-52"
        />

        <dl className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { k: "Game", v: "Blast Click" },
            { k: "Daily login", v: "+100 pts" },
            { k: "High score", v: "+250 pts" },
            { k: "Challenge", v: "+500 pts" },
          ].map((s) => (
            <div key={s.k} className="rounded-2xl border border-border bg-background/40 px-4 py-3">
              <dt className="font-body text-[0.62rem] font-bold tracking-[0.2em] text-muted-foreground uppercase">
                {s.k}
              </dt>
              <dd className="mt-1 font-display text-lg text-cyber">{s.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* cards */}
      <section className="grid gap-5 lg:grid-cols-3">
        <Card
          to="/arcade"
          kicker="Arcade"
          title="Blast Click"
          body="30 seconds, endless combos. Beat your own record and bank the points."
          emoji="🕹️"
        />
        <Card
          to="/roast"
          kicker="Blast Roast"
          title="Roast my token"
          body="Feed a ticker to the roast machine and get flamed in seconds."
          emoji="🔥"
        />
        <Card
          to="/chat"
          kicker="Community"
          title="Blast chat"
          body="Wallet-verified chat. Talk trash, earn points for showing up."
          emoji="💬"
        />
      </section>

      {/* leaderboard + challenge */}
      <section className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="panel p-5 sm:p-6">
          <SectionTitle
            kicker="Trending today"
            title="Top blasters"
            action={
              <Link to="/leaderboard" className="font-body text-sm text-cyber hover:underline">
                Full leaderboard →
              </Link>
            }
          />
          {leaders.isLoading ? (
            <p className="font-body text-muted-foreground">Loading scores…</p>
          ) : (leaders.data ?? []).length === 0 ? (
            <p className="font-body text-muted-foreground">
              Nobody has played today yet. Be the first name on the board.
            </p>
          ) : (
            <ol className="space-y-2">
              {(leaders.data ?? []).slice(0, 6).map((row) => (
                <li
                  key={row.userId}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-background/40 px-4 py-3"
                >
                  <span className="w-7 font-display text-lg text-primary">#{row.rank}</span>
                  <PlayerAvatar address={row.wallet} size={34} />
                  <PlayerName address={row.wallet} nickname={row.nickname} className="flex-1" />
                  <span className="font-display text-lg text-lime">{formatNumber(row.best)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="space-y-6">
          <div className="panel p-5 sm:p-6">
            <SectionTitle kicker="Daily challenge" title="Today's mission" />
            {challenge.data ? (
              <>
                <p className="font-display text-xl">{challenge.data.title}</p>
                <p className="mt-2 font-body text-sm text-muted-foreground">
                  {challenge.data.description}
                </p>
                <p className="mt-4 font-display text-lg text-lime">
                  +{formatNumber(challenge.data.reward_points)} points
                </p>
              </>
            ) : (
              <p className="font-body text-muted-foreground">
                No challenge posted yet — check back shortly.
              </p>
            )}
          </div>

          <div className="panel p-5 sm:p-6">
            <SectionTitle
              kicker="Meme of the day"
              title="Battle"
              action={
                <Link to="/meme" className="font-body text-sm text-cyber hover:underline">
                  Vote →
                </Link>
              }
            />
            {battle.data ? (
              <div className="grid grid-cols-2 gap-3">
                {[battle.data.a, battle.data.b].map((m) => (
                  <div key={m.id} className="overflow-hidden rounded-2xl border border-border">
                    <img
                      src={m.image_url}
                      alt={m.title}
                      loading="lazy"
                      className="aspect-square w-full object-cover"
                    />
                    <p className="px-3 py-2 font-body text-xs text-muted-foreground">
                      {m.votes} votes
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-body text-muted-foreground">
                No battle running yet — submit a meme to start one.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* chat peek */}
      <section className="panel p-5 sm:p-6">
        <SectionTitle
          kicker="Community chat"
          title="Latest noise"
          action={
            <Link to="/chat" className="font-body text-sm text-cyber hover:underline">
              Join the chat →
            </Link>
          }
        />
        {(chat.data ?? []).length === 0 ? (
          <p className="font-body text-muted-foreground">Chat is quiet. Say something loud.</p>
        ) : (
          <ul className="space-y-3">
            {(chat.data ?? []).map((m) => (
              <li key={m.id} className="flex items-start gap-3">
                <PlayerAvatar address={m.author?.wallet_address ?? "0x0"} size={32} />
                <div>
                  <p className="font-body text-xs text-muted-foreground">
                    <PlayerName
                      address={m.author?.wallet_address ?? "0x0"}
                      nickname={m.author?.nickname}
                      className="text-foreground"
                    />{" "}
                    · {timeAgo(m.created_at)}
                  </p>
                  <p className="font-body">{m.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Card({
  to,
  kicker,
  title,
  body,
  emoji,
}: {
  to: "/arcade" | "/roast" | "/chat";
  kicker: string;
  title: string;
  body: string;
  emoji: string;
}) {
  return (
    <Link
      to={to}
      className="panel group p-6 transition-transform hover:-translate-y-1 hover:glow-blast"
    >
      <span className="text-3xl" aria-hidden="true">
        {emoji}
      </span>
      <p className="mt-4 font-body text-xs font-bold tracking-[0.22em] text-cyber uppercase">
        {kicker}
      </p>
      <h3 className="mt-1 font-display text-2xl">{title}</h3>
      <p className="mt-2 font-body text-sm text-muted-foreground">{body}</p>
    </Link>
  );
}
