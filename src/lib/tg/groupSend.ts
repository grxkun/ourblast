/** Group sends: "@ourblastsuibot send @john 100 BLAST", "/send 100 $BLAST to @john", or reply + "/tip 5 sui". */
export interface GroupSend { amount: string; token: string; tgUsername: string | null }

const AMT = String.raw`(\d*\.?\d+)`;
const TOK = String.raw`(0x[a-f0-9]{1,64}::\w+::\w+|\$?[a-z][a-z0-9]{0,15})`;
const USER = String.raw`@([a-z0-9_]{4,32})`;

export function parseGroupSend(raw: string, botUsername = "ourblastsuibot"): GroupSend | null {
  const bot = new RegExp(`@${botUsername}\\b`, "ig");
  const addressed = bot.test(raw) || /^\/(send|tip)(@\w+)?\b/i.test(raw.trim());
  if (!addressed) return null;
  const t = raw.replace(bot, " ").replace(/^\s*\/(send|tip)(@\w+)?/i, "send").replace(/\s+/g, " ").trim();
  const norm = (tok: string) => (tok.startsWith("0x") ? tok : tok.replace(/^\$/, "").toUpperCase());
  let m = t.match(new RegExp(`^(?:send|tip) ${USER} ${AMT} ${TOK}$`, "i"));
  if (m) return { tgUsername: m[1]!, amount: m[2]!, token: norm(m[3]!) };
  m = t.match(new RegExp(`^(?:send|tip) ${AMT} ${TOK} to ${USER}$`, "i"));
  if (m) return { amount: m[1]!, token: norm(m[2]!), tgUsername: m[3]! };
  m = t.match(new RegExp(`^(?:send|tip) ${AMT} ${TOK}$`, "i"));
  if (m) return { amount: m[1]!, token: norm(m[2]!), tgUsername: null };
  return null;
}
