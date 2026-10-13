// SPDX-License-Identifier: BUSL-1.1
/**
 * Terminal chat commands that spend SOL from the user's OurBank Solana address:
 * "bridge 0.03 sol", "bridge sol", "buy blast with 0.03 sol", "buy 0.03 sol of blast".
 * amountSol undefined = bridge everything.
 */
export type SolCommand = { amountSol?: number; buyBlast?: true };

const NUM = "(\\d+(?:\\.\\d+)?|\\.\\d+)";
const PATTERNS = [
  new RegExp(`^(?:bridge|sweep)\\s+(?:${NUM}\\s+)?sol(?:\\s+(?:now|to\\s+sui|to\\s+blast))*$`, "i"),
  new RegExp(`^(?:bridge|sweep)\\s+sol\\s+${NUM}$`, "i"),
  new RegExp(`^(?:buy|ape|swap)\\s+\\$?blast\\s+(?:with|using|for)\\s+${NUM}\\s+sol$`, "i"),
  new RegExp(`^(?:buy|ape|swap)\\s+${NUM}\\s+sol\\s+(?:of|into|to|for)\\s+\\$?blast$`, "i"),
];

export function parseSolCommand(text: string): SolCommand | null {
  // Tweets: drop @mentions, links, trailing punctuation and "on/in sui".
  const clean = text
    .replace(/@[a-z0-9_]{1,15}/gi, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s.,!?]+$/g, "")
    .replace(/\s+(?:on|in|via)\s+sui$/i, "")
    .trim();
  for (const re of PATTERNS) {
    const m = clean.match(re);
    if (!m) continue;
    const buy = /^(?:buy|ape|swap)\b/i.test(clean) || /to\s+blast/i.test(clean) ? { buyBlast: true as const } : {};
    if (m[1] === undefined) return { ...buy };
    const amountSol = Number(m[1]);
    return Number.isFinite(amountSol) && amountSol > 0 ? { amountSol, ...buy } : null;
  }
  return null;
}
