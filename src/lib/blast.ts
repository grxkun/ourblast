/** Shared, browser-safe helpers for OURBLAST. */

export const POINTS = {
  dailyLogin: 100,
  playGame: 50,
  highScore: 250,
  dailyChallenge: 500,
  achievement: 1000,
  chatMessage: 10,
  memeVote: 10,
  memeSubmit: 100,
} as const;

export const CHAT_DAILY_POINT_CAP = 20; // messages that earn points per day
export const GAME_DURATION_MS = 30_000;

/**
 * Blast Click difficulty tiers. Shared with the server so score validation
 * knows the highest total a run of each tier can plausibly reach.
 */
export const DIFFICULTIES = {
  easy: {
    label: "Chill",
    blurb: "Big blast, patient combo window.",
    sizeRem: 8,
    comboWindowMs: 620,
    maxCombo: 8,
    multiplier: 1,
    driftMs: 0, // target only moves when hit
  },
  normal: {
    label: "Normal",
    blurb: "Standard blast, x12 combo ceiling.",
    sizeRem: 6,
    comboWindowMs: 450,
    maxCombo: 12,
    multiplier: 1.25,
    driftMs: 1400,
  },
  hard: {
    label: "Helmet off",
    blurb: "Tiny blast that keeps running. Big payout.",
    sizeRem: 4,
    comboWindowMs: 330,
    maxCombo: 16,
    multiplier: 1.6,
    driftMs: 750,
  },
} as const;

export type DifficultyKey = keyof typeof DIFFICULTIES;
export const DIFFICULTY_KEYS = ["easy", "normal", "hard"] as const;

export function shortAddress(address: string | null | undefined, size = 4) {
  if (!address) return "";
  if (address.length <= size * 2 + 4) return address;
  return `${address.slice(0, 2 + size)}…${address.slice(-size)}`.toUpperCase();
}

export function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US").format(Math.round(value ?? 0));
}

export function loginMessage(address: string, issuedAt: string) {
  return [
    "OURBLAST — Blast Community Arcade",
    "Sign in to prove this wallet is yours.",
    "This is a free signature. It never moves funds and never reveals your keys.",
    `Wallet: ${address}`,
    `Issued: ${issuedAt}`,
  ].join("\n");
}

/** Deterministic avatar colours + emoji derived from a wallet address. */
export function avatarFromAddress(address: string) {
  let hash = 0;
  for (let i = 0; i < address.length; i++) hash = (hash * 31 + address.charCodeAt(i)) % 100000;
  const hue = hash % 360;
  const emojis = ["💥", "🔥", "🕹️", "😂", "🛸", "👾", "🎯", "⚡", "🪐", "🍄", "🧨", "🦾"];
  return {
    emoji: emojis[hash % emojis.length]!,
    from: `oklch(0.62 0.2 ${hue})`,
    to: `oklch(0.72 0.18 ${(hue + 60) % 360})`,
  };
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function msToClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
