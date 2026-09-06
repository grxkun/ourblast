import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import blastCool from "@/assets/blast-cool.png.asset.json";
import blastLaughing from "@/assets/blast-laughing.png.asset.json";
import blastStoned from "@/assets/blast-stoned.png.asset.json";
import blastThinking from "@/assets/blast-thinking.png.asset.json";
import { useBlast } from "@/components/blast/session";
import {
  DIFFICULTIES,
  DIFFICULTY_KEYS,
  GAME_DURATION_MS,
  formatNumber,
  msToClock,
  type DifficultyKey,
} from "@/lib/blast";
import { FEES } from "@/lib/ourblast.config";
import { primeAudio, setSoundEnabled, sfx, soundEnabled, syncSoundPreference } from "@/lib/sound";
import { submitScore } from "@/lib/game.functions";

type Phase = "idle" | "playing" | "over";
type Pop = { id: number; x: number; y: number; value: number };

const STORAGE_KEY = "ourblast.blastclick.difficulty";

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
  const [difficulty, setDifficulty] = useState<DifficultyKey>("normal");
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
  const playedTier = useRef<DifficultyKey>("normal");
  const remainingRef = useRef(GAME_DURATION_MS);

  const tier = DIFFICULTIES[difficulty];

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && (DIFFICULTY_KEYS as readonly string[]).includes(saved)) {
      setDifficulty(saved as DifficultyKey);
    }
  }, []);

  const chooseDifficulty = (key: DifficultyKey) => {
    setDifficulty(key);
    try {
      window.localStorage.setItem(STORAGE_KEY, key);
    } catch {
      /* storage unavailable */
    }
  };

  useEffect(() => {
    setSound(soundEnabled());
    syncSoundPreference();
  }, []);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    setSoundEnabled(next);
    syncSoundPreference();
    if (next) sfx.ui();
  };

  const startRound = () => {
    setScore(0);
    setClicks(0);
    setCombo(1);
    setMaxCombo(1);
    setPops([]);
    setResult(null);
    setRemaining(GAME_DURATION_MS);
    endsAt.current = Date.now() + GAME_DURATION_MS;
    remainingRef.current = GAME_DURATION_MS;
    lastClick.current = 0;
    playedTier.current = difficulty;
    sfx.start();
    setTarget({ x: 50, y: 50 });
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
      primeAudio();
      paymentId.current = await pay("game");
      sfx.coin();
      toast.success(`${FEES.game} SUI sent to the OURBLAST treasury`, {
        description: "Entry confirmed — go smash it.",
      });
      startRound();
    } catch (error) {
      paymentId.current = null;
      sfx.error();
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
      sfx.gameOver();
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
            difficulty: playedTier.current,
          },
        });
        paymentId.current = null;
        setResult(res);
        refresh();
        if (res.isPersonalBest) sfx.fanfare();
        else if (res.pointsEarned > 0) sfx.points();
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
        if (left <= 5_200 && Math.ceil(left / 1000) !== Math.ceil(remainingRef.current / 1000)) {
          sfx.tick(left <= 3_000);
        }
        remainingRef.current = left;
        setRemaining(left);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, score, clicks, maxCombo, finish]);

  // Harder tiers keep the blast moving even when you miss it.
  useEffect(() => {
    if (phase !== "playing") return;
    const drift = DIFFICULTIES[playedTier.current].driftMs;
    if (!drift) return;
    const id = window.setInterval(() => {
      setTarget({ x: 18 + Math.random() * 64, y: 20 + Math.random() * 58 });
    }, drift);
    return () => window.clearInterval(id);
  }, [phase]);

  const hit = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (phase !== "playing") return;
    const now = Date.now();
    const active = DIFFICULTIES[playedTier.current];
    const nextCombo =
      now - lastClick.current < active.comboWindowMs ? Math.min(combo + 1, active.maxCombo) : 1;
    lastClick.current = now;

    const gained = Math.round(10 * nextCombo * active.multiplier);
    const rect = event.currentTarget.getBoundingClientRect();
    const id = popId.current++;

    if (nextCombo === 1 && combo > 2) sfx.comboBreak();
    else if (nextCombo % 5 === 0) sfx.comboUp(nextCombo);
    else sfx.hit(nextCombo);
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

  const reaction =
    phase === "idle"
      ? { src: blastThinking.url, alt: "BLAST mascot thinking before the game" }
      : phase === "playing"
        ? combo >= 5
          ? { src: blastLaughing.url, alt: "BLAST mascot laughing at a strong combo" }
          : { src: blastCool.url, alt: "BLAST mascot looking cool during the game" }
        : result?.isPersonalBest
          ? { src: blastCool.url, alt: "BLAST mascot celebrating a personal best" }
          : score >= 1_000
            ? { src: blastLaughing.url, alt: "BLAST mascot laughing after a strong run" }
            : { src: blastStoned.url, alt: "BLAST mascot dazed after a rough run" };

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
            onClick={toggleSound}
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
              className="animate-pulse-ring absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary transition-all duration-150"
              style={{
                left: `${target.x}%`,
                top: `${target.y}%`,
                width: `${DIFFICULTIES[playedTier.current].sizeRem}rem`,
                height: `${DIFFICULTIES[playedTier.current].sizeRem}rem`,
                fontSize: `${DIFFICULTIES[playedTier.current].sizeRem / 2.6}rem`,
              }}
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

          {phase === "playing" ? (
            <img
              key={reaction.src}
              src={reaction.src}
              alt={reaction.alt}
              className="animate-pop-in pointer-events-none absolute bottom-3 left-3 h-24 w-24 object-contain drop-shadow-md sm:h-32 sm:w-32"
            />
          ) : null}
        </button>

        {phase !== "playing" ? (
          <div className="absolute inset-0 grid place-items-center bg-background/85 px-5 backdrop-blur-sm">
            {phase === "idle" ? (
              <div className="animate-pop-in max-w-md text-center">
                <img
                  src={reaction.src}
                  alt={reaction.alt}
                  className="mx-auto mb-2 h-28 w-28 object-contain sm:h-32 sm:w-32"
                />
                <h4 className="font-display text-4xl">Smash the blast</h4>
                <p className="mt-3 font-body text-muted-foreground">
                  30 seconds. Every hit is 10 points, and hitting fast stacks a combo. Miss a beat
                  and the combo resets.
                </p>

                <div className="mt-5">
                  <p className="font-body text-[0.62rem] font-bold tracking-[0.2em] text-muted-foreground uppercase">
                    Difficulty
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {DIFFICULTY_KEYS.map((key) => {
                      const option = DIFFICULTIES[key];
                      const selected = key === difficulty;
                      return (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            primeAudio();
                            sfx.ui();
                            chooseDifficulty(key);
                          }}
                          className={`rounded-2xl border px-2 py-2 font-display text-sm tracking-wide uppercase transition-colors ${
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border hover:bg-secondary"
                          }`}
                        >
                          {option.label}
                          <span className="mt-0.5 block font-body text-[0.6rem] tracking-normal normal-case opacity-80">
                            x{option.multiplier} pts
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 font-body text-xs text-muted-foreground">
                    {tier.blurb} Combo up to x{tier.maxCombo}, every point worth x{tier.multiplier}.
                  </p>
                </div>
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
                <img
                  src={reaction.src}
                  alt={reaction.alt}
                  className="mx-auto h-28 w-28 object-contain sm:h-32 sm:w-32"
                />
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
