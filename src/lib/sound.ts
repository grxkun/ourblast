/**
 * Tiny WebAudio arcade sound engine.
 *
 * No audio files: everything is synthesised on the fly so there is nothing to
 * download and every sound can react to gameplay (combo pitch, countdown
 * urgency). One shared AudioContext, created lazily on the first user gesture
 * so browsers never block it.
 */

const STORAGE_KEY = "ourblast.sound.enabled";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function soundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === null) return true;
  return saved === "1";
}

export function setSoundEnabled(next: boolean) {
  enabled = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
  if (next) context();
}

/** Call once from a click handler so mobile browsers unlock audio. */
export function primeAudio() {
  context();
}

type ToneOptions = {
  freq: number;
  to?: number;
  duration?: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
};

function tone({ freq, to, duration = 0.12, type = "square", gain = 0.16, delay = 0 }: ToneOptions) {
  const audio = context();
  if (!audio || !master || !enabled) return;
  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const vol = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (to && to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), start + duration);
  vol.gain.setValueAtTime(0.0001, start);
  vol.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  vol.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(vol).connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noise(duration = 0.2, gain = 0.14, sweepFrom = 1800, sweepTo = 120) {
  const audio = context();
  if (!audio || !master || !enabled) return;
  const frames = Math.floor(audio.sampleRate * duration);
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = audio.createBufferSource();
  src.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(sweepFrom, audio.currentTime);
  filter.frequency.exponentialRampToValueAtTime(sweepTo, audio.currentTime + duration);
  const vol = audio.createGain();
  vol.gain.setValueAtTime(gain, audio.currentTime);
  vol.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
  src.connect(filter).connect(vol).connect(master);
  src.start();
}

export const sfx = {
  /** Hit sound: pitch climbs with the combo so streaks feel like a melody. */
  hit(combo = 1) {
    const step = Math.min(combo, 16);
    tone({ freq: 300 + step * 55, to: 520 + step * 70, duration: 0.09, type: "square", gain: 0.15 });
    noise(0.06, 0.07, 2600, 600);
  },
  /** Missed the blast — a short dull thud, never punishing. */
  miss() {
    tone({ freq: 150, to: 90, duration: 0.1, type: "sine", gain: 0.1 });
  },
  /** Combo streak dropped. */
  comboBreak() {
    tone({ freq: 420, to: 160, duration: 0.22, type: "triangle", gain: 0.13 });
  },
  /** Combo hit a milestone (x5, x10, x15…). */
  comboUp(combo: number) {
    tone({ freq: 660, duration: 0.07, type: "square", gain: 0.12 });
    tone({ freq: 880 + combo * 12, duration: 0.1, type: "square", gain: 0.12, delay: 0.06 });
  },
  /** Round begins. */
  start() {
    [392, 523, 659].forEach((f, i) =>
      tone({ freq: f, duration: 0.12, type: "square", gain: 0.14, delay: i * 0.09 }),
    );
  },
  /** Last five seconds tick. */
  tick(urgent = false) {
    tone({ freq: urgent ? 1040 : 760, duration: 0.05, type: "square", gain: 0.1 });
  },
  /** Round over. */
  gameOver() {
    [523, 415, 330, 262].forEach((f, i) =>
      tone({ freq: f, duration: 0.16, type: "triangle", gain: 0.14, delay: i * 0.12 }),
    );
  },
  /** Personal best / big score fanfare. */
  fanfare() {
    [523, 659, 784, 1046].forEach((f, i) =>
      tone({ freq: f, duration: 0.16, type: "square", gain: 0.15, delay: i * 0.08 }),
    );
  },
  /** Points banked. */
  points() {
    tone({ freq: 880, duration: 0.08, type: "sine", gain: 0.13 });
    tone({ freq: 1320, duration: 0.12, type: "sine", gain: 0.12, delay: 0.07 });
  },
  /** Wallet payment confirmed — the coin-drop moment. */
  coin() {
    tone({ freq: 988, duration: 0.07, type: "square", gain: 0.14 });
    tone({ freq: 1319, duration: 0.16, type: "square", gain: 0.13, delay: 0.06 });
  },
  /** Something failed. */
  error() {
    tone({ freq: 240, to: 120, duration: 0.28, type: "sawtooth", gain: 0.12 });
  },
  /** Light UI feedback for buttons and pickers. */
  ui() {
    tone({ freq: 620, duration: 0.045, type: "square", gain: 0.07 });
  },
};

export function syncSoundPreference() {
  enabled = soundEnabled();
  return enabled;
}
