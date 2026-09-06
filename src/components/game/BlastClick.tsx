import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useBlast } from "@/components/blast/session";
import { GAME_DURATION_MS, formatNumber, msToClock } from "@/lib/blast";
import { FEES } from "@/lib/ourblast.config";
import { submitScore } from "@/lib/game.functions";

type Phase = "idle" | "playing" | "over";
type Pop = { id: number; x: number; y: number; value: number };

const COMBO_WINDOW_MS = 450;

export function BlastClick() {
  const { userId, connect, refresh, pay } = useBlast();
  const submit = useServerFn(submitScore);

  const [phase, setPhase] = useState<Phase>("idle");
  const [score, setScore] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [combo, setCombo] = useState(1);
  const [maxCombo, setMaxCombo] = useState(1);
  const [remaining, setRemaining] = useState(GAME_DURATION_MS);
  const [pops, setPops] = useState<Pop[]>([]);
  const [target, setTarget] = useState({ x: 50, y: 50 });
  const [sound, setSound] = useState(true);
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState<{
    rank: number;
    pointsEarned: number;
    isPersonalBest: boolean;
    challengeCompleted: boolean;
    newAchievements: string[];
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const lastClick = useRef(0);
  const popId = useRef(0);
  const endsAt = useRef(0);
  const paymentId = useRef<string | null>(null);
  const audio = useRef<AudioContext | null>(null);

  const blip = useCallback(
    (pitch: number) => {
      if (!sound) return;
      try {
        audio.current ??= new AudioContext();
        const ctx = audio.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = 220 + pitch * 40;
        gain.gain.value = 0.05;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.stop(ctx.currentTime + 0.09);
      } catch {
        /* audio unavailable */
      }
    },
    [sound],
  );

  const startRound = () => {
    setScore(0);
    setClicks(0);
    setCombo(1);
    setMaxCombo(1);
    setPops([]);
    setResult(null);
    setRemaining(GAME_DURATION_MS);
    endsAt.current = Date.now() + GAME_DURATION_MS;
    lastClick.current = 0;
    setPhase("playing");
  };

  /** Pay first, verify, then play. A rejected payment never starts a round. */
  const payAndStart = async () => {
    if (!userId) {
      await connect();
      return;
    }
    setPaying(true);
    try {
      paymentId.current = await pay("game");
      toast.success(`${FEES.game} SUI sent to the OURBLAST treasury`, {
        description: "Entry confirmed — go smash it.",
      });
      startRound();
    } catch (error) {
      paymentId.current = null;
      toast.error("Payment not completed", {
        description:
          error instanceof Error ? error.message : "The transaction was rejected. Try again.",
      });
    } finally {
      setPaying(false);
    }
  };

  const finish = useCallback(
    async (finalScore: number, finalClicks: number, finalCombo: number) => {
      setPhase("over");
      const ticket = paymentId.current;
      if (!userId || !ticket) return;
      setSaving(true);
      try {
        const res = await submit({
          data: {
            score: finalScore,
            clicks: finalClicks,
            maxCombo: finalCombo,
            durationMs: GAME_DURATION_MS,
            paymentId: ticket,
            gameKey: "blast_click",
          },
        });
        paymentId.current = null;
        setResult(res);
        refresh();
        if (res.pointsEarned > 0) {
          toast.success(`+${formatNumber(res.pointsEarned)} BLAST POINTS`, {
            description: res.isPersonalBest ? "New personal best 🔥" : undefined,
          });
        }
      } catch (error) {
        toast.error("Score not saved", {
          description: error instanceof Error ? error.message : "Try another run.",
        });
      } finally {
        setSaving(false);
      }
    },
    [submit, userId, refresh],
  );

  useEffect(() => {
    if (phase !== "playing") return;
    const id = window.setInterval(() => {
      const left = endsAt.current - Date.now();
      if (left <= 0) {
        window.clearInterval(id);
        setRemaining(0);
        void finish(score, clicks, maxCombo);
      } else {
        setRemaining(left);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, score, clicks, maxCombo, finish]);

  const hit = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (phase !== "playing") return;
    const now = Date.now();
    const nextCombo = now - lastClick.current < COMBO_WINDOW_MS ? Math.min(combo + 1, 12) : 1;
    lastClick.current = now;

    const gained = 10 * nextCombo;
    const rect = event.currentTarget.getBoundingClientRect();
    const id = popId.current++;

    blip(nextCombo);
    setCombo(nextCombo);
    setMaxCombo((m) => Math.max(m, nextCombo));
    setScore((s) => s + gained);
    setClicks((c) => c + 1);
    setPops((list) => [
      ...list.slice(-8),
      { id, x: event.clientX - rect.left, y: event.clientY - rect.top, value: gained },
    ]);
    window.setTimeout(() => setPops((list) => list.filter((p) => p.id !== id)), 900);
    setTarget({ x: 18 + Math.random() * 64, y: 20 + Math.random() * 58 });
  };

  const share = async () => {
    const text = `I scored ${formatNumber(score)} in BLAST CLICK on OURBLAST 💥 helmets on.`;
    try {
      if (navigator.share) await navigator.share({ text, url: "https://ourblast.xyz/arcade" });
      else {
        await navigator.clipboard.writeText(`${text} https://ourblast.xyz/arcade`);
        toast.success("Score copied — go brag.");
      }
    } catch {
      /* user dismissed the share sheet */
    }
  };

  const playLabel = paying
    ? "Waiting for wallet…"
    : userId
      ? `Play for ${FEES.game} SUI`
      : "Connect Slush to play";

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <p className="font-body text-xs font-bold tracking-[0.22em] text-cyber uppercase">
            Arcade game 01
          </p>
          <h3 className="font-display text-2xl">Blast Click</h3>
        </div>
        <div className="flex items-center gap-5">
          <Stat label="Time" value={msToClock(remaining)} />
          <Stat label="Score" value={formatNumber(score)} highlight />
          <Stat label="Combo" value={`x${combo}`} />
          <button
            type="button"
            onClick={() => setSound((s) => !s)}
            aria-label={sound ? "Turn sound off" : "Turn sound on"}
            className="rounded-full border border-border px-3 py-1.5 font-body text-sm"
          >
            {sound ? "🔊" : "🔇"}
          </button>
        </div>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={hit}
          disabled={phase !== "playing"}
          aria-label="Hit the blast target"
          className="grid-noise relative block h-[22rem] w-full touch-manipulation cursor-crosshair select-none sm:h-[26rem]"
        >
          {phase === "playing" ? (
            <span
              className="animate-pulse-ring absolute grid size-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary text-4xl transition-all duration-100 sm:size-28"
              style={{ left: `${target.x}%`, top: `${target.y}%` }}
            >
              💥
            </span>
          ) : null}

          {pops.map((p) => (
            <span
              key={p.id}
              className="animate-float-up pointer-events-none absolute font-display text-2xl text-lime"
              style={{ left: p.x, top: p.y, ["--dx" as string]: "-50%" }}
            >
              +{p.value}
            </span>
          ))}
        </button>

        {phase !== "playing" ? (
          <div className="absolute inset-0 grid place-items-center bg-background/85 px-5 backdrop-blur-sm">
            {phase === "idle" ? (
              <div className="animate-pop-in max-w-md text-center">
                <h4 className="font-display text-4xl">Smash the blast</h4>
                <p className="mt-3 font-body text-muted-foreground">
                  30 seconds. Every hit is 10 points, and hitting fast stacks a combo multiplier up
                  to x12. Miss a beat and the combo resets.
                </p>
                <p className="mt-4 font-body text-sm">
                  Play cost{" "}
                  <span className="font-display text-lime">{FEES.game} SUI</span> — paid straight to
                  the OURBLAST treasury from your own wallet.
                </p>
                <button
                  type="button"
                  disabled={paying}
                  onClick={() => void payAndStart()}
                  className="glow-blast mt-5 rounded-full bg-primary px-8 py-3 font-display text-xl tracking-wide text-primary-foreground uppercase transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {playLabel}
                </button>
                <p className="mt-3 font-body text-xs text-muted-foreground">
                  Your wallet is your player card. OURBLAST never holds your funds — you approve
                  every transaction in Slush.
                </p>
              </div>
            ) : (
              <div className="animate-pop-in w-full max-w-md text-center">
                <p className="font-body text-xs font-bold tracking-[0.22em] text-cyber uppercase">
                  Game over
                </p>
                <p className="text-glow mt-2 font-display text-6xl">{formatNumber(score)}</p>
                <p className="mt-1 font-body text-muted-foreground">
                  {formatNumber(clicks)} hits · best combo x{maxCombo}
                </p>

                <div className="mt-4 min-h-12 font-body text-sm">
                  {saving ? (
                    <p className="text-muted-foreground">Saving your run…</p>
                  ) : result ? (
                    <p className="text-lime">
                      Rank #{result.rank} all time
                      {result.pointsEarned > 0
                        ? ` · +${formatNumber(result.pointsEarned)} points`
                        : ""}
                      {result.challengeCompleted ? " · daily challenge done 🎯" : ""}
                    </p>
                  ) : !userId ? (
                    <p className="text-muted-foreground">Connect a wallet to bank this score.</p>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    disabled={paying}
                    onClick={() => void payAndStart()}
                    className="glow-blast rounded-full bg-primary px-6 py-2.5 font-display tracking-wide text-primary-foreground uppercase disabled:opacity-60"
                  >
                    {paying ? "Waiting for wallet…" : `Play again · ${FEES.game} SUI`}
                  </button>
                  <button
                    type="button"
                    onClick={() => void share()}
                    className="rounded-full bg-secondary px-6 py-2.5 font-display tracking-wide text-secondary-foreground uppercase"
                  >
                    Share score
                  </button>
                  <Link
                    to="/leaderboard"
                    className="rounded-full border border-border px-6 py-2.5 font-display tracking-wide uppercase"
                  >
                    Leaderboard
                  </Link>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="text-right">
      <p className="font-body text-[0.62rem] font-bold tracking-[0.2em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className={`font-display text-xl ${highlight ? "text-lime" : ""}`}>{value}</p>
    </div>
  );
}
