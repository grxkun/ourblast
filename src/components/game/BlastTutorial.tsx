import { useEffect, useRef, useState } from "react";

import { FEES } from "@/lib/ourblast.config";

const STORAGE_KEY = "ourblast.tutorial.blastclick.v1";
const COMBO_WINDOW_MS = 450;
const TIMED_MS = 6000;

type Pop = { id: number; x: number; y: number; value: number };

const STEPS = [
  {
    title: "Hit the blast",
    goal: "Tap the red blast once.",
    body: "The blast jumps to a new spot after every hit. Anywhere inside the board counts — speed matters more than precision.",
  },
  {
    title: "Chain a combo",
    goal: "Reach x3 by hitting fast.",
    body: "Hits landed within half a second of each other stack your multiplier, all the way to x12.",
  },
  {
    title: "Do not stall",
    goal: "Pause a second, then hit again.",
    body: "A gap between hits drops you back to x1. Rhythm is the whole game.",
  },
  {
    title: "Beat the clock",
    goal: "Score as much as you can in 6 seconds.",
    body: "The real round is 30 seconds. Here is a short taste of it.",
  },
] as const;

export function BlastTutorial({ onPlay }: { onPlay?: () => void }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(true);
  const [step, setStep] = useState(0);
  const [combo, setCombo] = useState(1);
  const [score, setScore] = useState(0);
  const [hits, setHits] = useState(0);
  const [target, setTarget] = useState({ x: 50, y: 45 });
  const [pops, setPops] = useState<Pop[]>([]);
  const [timeLeft, setTimeLeft] = useState(TIMED_MS);
  const [finished, setFinished] = useState(false);

  const lastHit = useRef(0);
  const popId = useRef(0);
  const peakCombo = useRef(1);

  useEffect(() => {
    const seen = window.localStorage.getItem(STORAGE_KEY);
    setDone(seen === "1");
    if (seen !== "1") setOpen(true);
  }, []);

  // step 4 countdown
  useEffect(() => {
    if (!open || finished || step !== 3) return;
    const id = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 100) {
          window.clearInterval(id);
          completeTutorial();
          return 0;
        }
        return t - 100;
      });
    }, 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, finished, step]);

  const completeTutorial = () => {
    setFinished(true);
    setDone(true);
    window.localStorage.setItem(STORAGE_KEY, "1");
  };

  const reset = () => {
    setStep(0);
    setCombo(1);
    setScore(0);
    setHits(0);
    setPops([]);
    setTimeLeft(TIMED_MS);
    setFinished(false);
    lastHit.current = 0;
    peakCombo.current = 1;
  };

  const hit = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (finished) return;
    const now = Date.now();
    const fast = now - lastHit.current < COMBO_WINDOW_MS;
    const nextCombo = fast ? Math.min(combo + 1, 12) : 1;
    const gained = 10 * nextCombo;
    lastHit.current = now;

    const rect = event.currentTarget.getBoundingClientRect();
    const id = popId.current++;
    setPops((list) => [
      ...list.slice(-6),
      { id, x: event.clientX - rect.left, y: event.clientY - rect.top, value: gained },
    ]);
    window.setTimeout(() => setPops((list) => list.filter((p) => p.id !== id)), 800);

    setCombo(nextCombo);
    setScore((s) => s + gained);
    setHits((h) => h + 1);
    setTarget({ x: 18 + Math.random() * 64, y: 20 + Math.random() * 56 });

    // step gates
    if (step === 0) {
      setStep(1);
    } else if (step === 1) {
      peakCombo.current = Math.max(peakCombo.current, nextCombo);
      if (nextCombo >= 3) setStep(2);
    } else if (step === 2) {
      if (!fast) {
        setStep(3);
        setTimeLeft(TIMED_MS);
      }
    }
  };

  if (!open) {
    return (
      <div className="panel flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <p className="font-body text-sm text-muted-foreground">
          {done ? "Tutorial finished." : "New to Blast Click?"} Practice for free, no wallet needed.
        </p>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(true);
          }}
          className="rounded-full border-2 border-border px-5 py-2 font-display tracking-wide uppercase transition-transform hover:-translate-y-0.5"
        >
          {done ? "Replay tutorial" : "Start tutorial"}
        </button>
      </div>
    );
  }

  const current = STEPS[step]!;

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <p className="font-body text-xs font-bold tracking-[0.22em] text-primary uppercase">
            Free practice · no wallet, no fee
          </p>
          <h3 className="mt-1 font-display text-2xl">
            {finished ? "Tutorial complete" : `Step ${step + 1} of ${STEPS.length} — ${current.title}`}
          </h3>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span
                key={s.title}
                className={`size-2.5 rounded-full border-2 border-border ${
                  finished || i < step ? "bg-primary" : i === step ? "bg-lime" : "bg-transparent"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full border border-border px-4 py-1.5 font-body text-sm"
          >
            Skip
          </button>
        </div>
      </div>

      {finished ? (
        <div className="px-5 py-8 text-center sm:px-8">
          <p className="font-display text-5xl text-primary">{score}</p>
          <p className="mt-1 font-body text-muted-foreground">
            {hits} practice hits · best combo x{Math.max(peakCombo.current, combo)}
          </p>
          <p className="mx-auto mt-5 max-w-md font-body text-muted-foreground">
            That is it. A real round lasts 30 seconds, costs {FEES.game} SUI paid straight to the
            community treasury from your own wallet, and lands your score on the leaderboard.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onPlay?.();
              }}
              className="glow-blast rounded-full bg-primary px-7 py-3 font-display text-lg tracking-wide text-primary-foreground uppercase transition-transform hover:-translate-y-0.5"
            >
              Play for real
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-full border-2 border-border px-7 py-3 font-display text-lg tracking-wide uppercase transition-transform hover:-translate-y-0.5"
            >
              Practice again
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary/40 px-5 py-3">
            <p className="font-body text-sm">
              <span className="font-display text-lg text-primary">Goal:</span> {current.goal}
            </p>
            <div className="flex items-center gap-5 font-display">
              <span className="font-body text-xs tracking-[0.2em] text-muted-foreground uppercase">
                Combo <span className="font-display text-base text-foreground">x{combo}</span>
              </span>
              <span className="font-body text-xs tracking-[0.2em] text-muted-foreground uppercase">
                Score <span className="font-display text-base text-lime">{score}</span>
              </span>
              {step === 3 ? (
                <span className="font-body text-xs tracking-[0.2em] text-muted-foreground uppercase">
                  Time{" "}
                  <span className="font-display text-base text-foreground">
                    {(timeLeft / 1000).toFixed(1)}s
                  </span>
                </span>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={hit}
            aria-label={current.goal}
            className="grid-noise relative block h-64 w-full touch-manipulation cursor-crosshair select-none sm:h-72"
          >
            <span
              className="animate-pulse-ring absolute grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary text-3xl transition-all duration-100 sm:size-24"
              style={{ left: `${target.x}%`, top: `${target.y}%` }}
            >
              💥
            </span>

            {pops.map((p) => (
              <span
                key={p.id}
                className="animate-float-up pointer-events-none absolute font-display text-xl text-lime"
                style={{ left: p.x, top: p.y, ["--dx" as string]: "-50%" }}
              >
                +{p.value}
              </span>
            ))}
          </button>

          <p className="border-t border-border px-5 py-3 font-body text-sm text-muted-foreground">
            {current.body}
          </p>
        </>
      )}
    </div>
  );
}
