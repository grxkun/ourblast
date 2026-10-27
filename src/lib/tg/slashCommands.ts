/**
 * Private-chat slash commands → plain OurBank chat commands.
 * Bare commands (e.g. "/send") return syntax help instead of running anything.
 */
const HELP: Record<string, string> = {
  buy: "🟢 Buy\n/buy 5 sui $BLAST\n/buy 2 sui of 0x…::coin::COIN\nOr paste a token address / $TICKER for the trade deck. You confirm before anything moves.",
  sell: "🔴 Sell\n/sell 50% $BLAST\n/sell 100% 0x…::coin::COIN\nYou confirm before anything moves.",
  send: "📤 Send\n/send 100 $BLAST to @user\n/send 1 sui to name.sui\n/send 5 sui to 0x…\n@user is an X handle linked to OurBank.",
  burn: "🔥 Burn\n/burn 1000 $BLAST — sends to the burn address\n/burn 2 sui of $BLAST — buys, then burns what was bought",
  snipe: "🎯 Snipe\n/snipe 0x…::coin::COIN 5 sui slippage 10%\nDefault slippage 10% (0.1–50%). Review, then confirm.",
  limit: "⏱ Limit orders\n/limit buy 5 sui of 0x…::coin::COIN at 0.0012\n/limit sell 50% 0x…::coin::COIN at 0.002\n/orders to view · cancel all",
  bridge: "🌉 Bridge\n/bridge 0.05 sol to sui\n/bridge 0.02 bnb to sui\n/bridge 10 sui to sol\n/bridges for history",
  swap: "🔁 Swap\n/swap 5 sui to usdc\n/swap 10 usdc to sui",
  scan: "🔍 Scan\n/scan 0x…::coin::COIN or /scan $TICKER",
};

export type SlashResult = { help: string } | { text: string } | null;

export function mapPrivateSlash(raw: string): SlashResult {
  const m = raw.trim().match(/^\/(buy|sell|send|burn|snipe|limit|bridge|swap|scan)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  if (!m) return null;
  const cmd = m[1]!.toLowerCase();
  const args = (m[2] ?? "").trim();
  if (!args) return { help: HELP[cmd]! };
  if (cmd === "scan") return { text: args };
  if (cmd === "burn") {
    const b = args.match(/^(\d*\.?\d+)\s+sui\s+(?:of\s+|worth of\s+)?(\S+)$/i);
    if (b) return { text: `buy and burn ${b[1]} sui of ${b[2]}` };
    const t = args.match(/^(\d*\.?\d+)\s+(\S+)$/);
    if (t && !/^\$?sui$/i.test(t[2]!)) return { text: `send ${t[1]} ${t[2]} to burn` };
    return { help: HELP["burn"]! };
  }
  if (cmd === "buy") {
    const b = args.match(/^(\d*\.?\d+)\s+sui\s+(?!of\b)(\S+)$/i);
    if (b) return { text: `buy ${b[1]} sui of ${b[2]}` };
  }
  if (cmd === "sell") {
    const s = args.match(/^(\d*\.?\d+%?)\s+(?!of\b)(\S+)$/i);
    if (s) return { text: `sell ${s[1]!.endsWith("%") ? s[1] : s[1] + "%"} of ${s[2]}` };
  }
  return { text: `${cmd} ${args}` };
}
