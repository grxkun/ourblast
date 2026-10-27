/**
 * Group /buy and /burn → the shared OurBank command line run as the sender.
 *   /buy 2 sui $BLAST · /buy 2 sui of 0x…::coin::COIN · @bot buy 2 sui of $BLAST
 *   /burn 1000 $BLAST → send to the burn address
 *   /burn 2 sui of $BLAST · /buy and burn 2 sui of $BLAST → buy, then burn what was bought
 */
const AMT = String.raw`(\d*\.?\d+)`;
const TOK = String.raw`(0x[a-f0-9]{1,64}::\w+::\w+|\$?[a-z][a-z0-9]{0,15})`;

const tok = (t: string) => (t.startsWith("0x") ? t : `$${t.replace(/^\$/, "").toUpperCase()}`);

export function parseGroupTrade(raw: string, botUsername = "ourblastsuibot"): string | null {
  const bot = new RegExp(`@${botUsername}\\b`, "ig");
  const tagged = bot.test(raw);
  const slash = /^\s*\/(buy|burn)(@\w+)?\b/i.test(raw);
  if (!tagged && !slash) return null;
  const t = raw.replace(bot, " ").replace(/^\s*\/(buy|burn)(@\w+)?/i, "$1").replace(/\s+/g, " ").trim();
  let m = t.match(new RegExp(`^(?:buy (?:and|&) burn|burn) ${AMT} sui (?:of |worth of )?${TOK}$`, "i"));
  if (m) return `buy and burn ${m[1]} sui of ${tok(m[2]!)}`;
  m = t.match(new RegExp(`^buy ${AMT} sui (?:of |worth of )?${TOK}$`, "i"));
  if (m) return `buy ${m[1]} sui of ${tok(m[2]!)}`;
  m = t.match(new RegExp(`^burn ${AMT} ${TOK}$`, "i"));
  if (m && !/^\$?sui$/i.test(m[2]!)) return `send ${m[1]} ${tok(m[2]!)} to burn`;
  return null;
}
