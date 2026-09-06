import { useEffect, useMemo, useRef, useState } from "react";

import { GAME_DURATION_MS, formatNumber, msToClock } from "@/lib/blast";

type Pop = { id: number; x: number; y: number; value: number };

/**
 * Auto-playing, non-interactive showcase of BLAST CLICK.
 * A ghost cursor chases the target so newcomers can see the game in motion
 * before paying anything. Purely visual: no wallet, no score submission.
 */
export function GamePreview() {
  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    [],
  );

  const [target, setTarget] = useState({ x: 34, y: 40 });
  const [cursor, setCursor] = useState({ x: 34, y: 40 });
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(1);
  const [remaining, setRemaining] = useState(GAME_DURATION_MS);
  const [flash, setFlash] = useState(false);
  const [pops, setPops] = useState<Pop[]>([]);
  const popId = useRef(0);

  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    let step = 0;

    const tick = () => {
      if (cancelled) return;
      step += 1;

      // land the ghost cursor on the current target, then move on
      setCursor(target);
      setFlash(true);
      window.setTimeout(() => setFlash(false), 140);

      const nextCombo = step % 9 === 0 ? 1 : Math.min(combo + 1, 12);
      const gained = 10 * nextCombo;
      setCombo(nextCombo);
      setScore((s) => (step % 27 === 0 ? 0 : s + gained));

      const id = popId.current++;
      setPops((list) => [...list.slice(-4), { id, x: target.x, y: target.y, value: gained }]);
      window.setTimeout(() => setPops((list) => list.filter((p) => p.id !== id)), 800);

      setTarget({ x: 16 + Math.random() * 66, y: 18 + Math.random() * 60 });
      setRemaining((r) => (r <= 700 ? GAME_DURATION_MS : r - 700));
    };

    const id = window.setInterval(tick, 700);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [reduced, target, combo]);

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-primary px-3 py-1 font-body text-[0.62rem] font-bold tracking-[0.2em] text-primary-foreground uppercase">
            Live demo
          </span>
          <p className="font-body text-sm text-muted-foreground">
            This is Blast Click in motion — watch before you play.
          </p>
        </div>
        <div className="flex items-center gap-5 font-display">
          <PreviewStat label="Time" value={msToClock(remaining)} />
          <PreviewStat label="Score" value={formatNumber(score)} highlight />
          <PreviewStat label="Combo" value={`x${combo}`} />
        </div>
      </div>

      <div
        aria-hidden="true"
        className="grid-noise relative h-52 w-full overflow-hidden select-none sm:h-64"
      >
        <span
          className="animate-pulse-ring absolute grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary text-3xl transition-all duration-500 ease-out sm:size-24"
          style={{ left: `${target.x}%`, top: `${target.y}%` }}
        >
          💥
        </span>

        <span
          className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-500 ease-out"
          style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }}
        >
          <span
            className={`block size-6 rounded-full border-2 border-foreground bg-background/70 transition-transform duration-150 ${
              flash ? "scale-150" : "scale-100"
            }`}
          />
        </span>

        {pops.map((p) => (
          <span
            key={p.id}
            className="animate-float-up pointer-events-none absolute font-display text-xl text-lime"
            style={{ left: `${p.x}%`, top: `${p.y}%`, ["--dx" as string]: "-50%" }}
          >
            +{p.value}
          </span>
        ))}
      </div>

      <p className="border-t border-border px-5 py-3 font-body text-sm text-muted-foreground">
        Hit the blast, keep hitting fast, and the multiplier climbs to x12. Pause and it drops back
        to x1.
      </p>
    </div>
  );
}

function PreviewStat({
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
      <p className="font-body text-[0.58rem] font-bold tracking-[0.2em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className={`font-display text-lg ${highlight ? "text-lime" : ""}`}>{value}</p>
    </div>
  );
}
