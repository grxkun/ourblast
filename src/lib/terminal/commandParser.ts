import type { ParsedIntent, TerminalIntentName } from "./types";

const cleanSymbol = (value?: string) => (value ?? "").replace(/^\$/, "").toUpperCase();

function intent(name: TerminalIntentName, raw: string, input: ParsedIntent["input"] = {}): ParsedIntent {
  return { name, raw, input, confidence: name === "unknown" ? 0 : 1 };
}

/** Words tweeters wrap around a command that carry no meaning for the parser. */
const FILLER = [
  /\b(?:can|could|would|will)\s+(?:you|u|ya)\b/gi,
  /\b(?:please|pls|plz|kindly|now|for\s+me|ser|fam|anon)\b/gi,
  /^(?:hey|hi|hello|yo|gm|ok|okay|so|and)\b/gi,
  /\blet'?s\b/gi,
  /\b(?:i\s+want\s+(?:to|you\s+to)|i'?d\s+like\s+(?:to|you\s+to))\b/gi,
];

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}]/gu;

/** Turns real tweet text into a bare command: no mentions, emoji, filler or stray punctuation. */
export function normalizeCommandText(rawInput: string): string {
  let text = rawInput.replace(/\r/g, " ").replace(/\n+/g, " ");
  // Drop every @mention (the bot's own handle and anyone else cc'd).
  text = text.replace(/@[a-z0-9_]{1,15}/gi, " ");
  // Drop links and hashtags people add to launch tweets.
  text = text.replace(/https?:\/\/\S+/gi, " ").replace(/#[\w]+/g, " ");
  text = text.replace(EMOJI, " ");
  for (const pattern of FILLER) text = text.replace(pattern, " ");
  text = text.replace(/["“”'‘’]/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  // Trailing chatter punctuation.
  text = text.replace(/[\s.,!?;:]+$/g, "").replace(/^[\s.,!?;:]+/g, "");
  return text;
}

const LAUNCH_VERB = /^(?:launch|create|deploy|mint|make|start|spin\s+up|ape)\s+(?:a\s+)?(?:new\s+)?(?:(?:meme\s+)?(?:coin|token)\s+)?(?:called\s+|named\s+)?/i;

const numberFrom = (value: string): number | null => {
  const match = value.trim().toLowerCase().match(/^([0-9]+(?:\.[0-9]+)?)\s*(k|m|b)?$/);
  if (!match?.[1]) return null;
  const scale = match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : match[2] === "b" ? 1_000_000_000 : 1;
  return Number(match[1]) * scale;
};

export function parseTerminalCommand(rawInput: string): ParsedIntent {
  const raw = normalizeCommandText(rawInput);
  let body = raw;

  // Optional "... paired with USDC" / "... pair $BLAST" / "... lp usdc" custom LP pairing.
  const pairMatch = body.match(/\s*(?:paired\s+with|pair(?:ed)?(?:\s+(?:with|against|to))?|lp(?:\s+(?:with|against))?)\s+\$?([a-z0-9]{2,10})\b/i);
  const pairToken = pairMatch?.[1]?.toUpperCase() ?? null;
  if (pairMatch) body = (body.slice(0, pairMatch.index) + body.slice((pairMatch.index ?? 0) + pairMatch[0].length)).trim();

  // Optional "... with 50 sui liquidity" / "... liquidity 50".
  let liquidity: number | null = null;
  const liqMatch = body.match(/\s*(?:with\s+)?([0-9]+(?:\.[0-9]+)?\s*[kmb]?)\s*\$?[a-z0-9]{0,10}?\s*(?:of\s+)?liquidity\b/i)
    ?? body.match(/\s*liquidity\s*(?:of\s+|=\s*)?([0-9]+(?:\.[0-9]+)?\s*[kmb]?)\b/i);
  if (liqMatch?.[1]) {
    liquidity = numberFrom(liqMatch[1]);
    body = (body.slice(0, liqMatch.index) + body.slice((liqMatch.index ?? 0) + liqMatch[0].length)).trim();
  }

  // Optional "... dev buy 5" / "... first buy 2 sui".
  let devBuy: number | null = null;
  const devMatch = body.match(/\s*(?:dev\s+buy|first\s+buy|initial\s+buy)\s*(?:of\s+|=\s*)?([0-9]+(?:\.[0-9]+)?\s*[kmb]?)\s*\$?[a-z0-9]{0,10}?\b/i);
  if (devMatch?.[1]) {
    devBuy = numberFrom(devMatch[1]);
    body = (body.slice(0, devMatch.index) + body.slice((devMatch.index ?? 0) + devMatch[0].length)).trim();
  }

  // Optional "... supply 1b".
  let totalSupply: number | null = null;
  const supplyMatch = body.match(/\s*(?:total\s+)?supply\s*(?:of\s+|=\s*)?([0-9]+(?:\.[0-9]+)?\s*[kmb]?)\b/i);
  if (supplyMatch?.[1]) {
    totalSupply = numberFrom(supplyMatch[1]);
    body = (body.slice(0, supplyMatch.index) + body.slice((supplyMatch.index ?? 0) + supplyMatch[0].length)).trim();
  }

  // Optional "... on maelstrom" / "... on strom" / "... on suipump" pad selection.
  const padMatch = body.match(/\s*\bon\s+(maelstrom|strom|mael|suipump|pump)(?:\.(?:org|sui\.io))?\b/i);
  const launchpad = padMatch?.[1]?.toLowerCase() ?? null;
  if (padMatch) body = (body.slice(0, padMatch.index) + body.slice((padMatch.index ?? 0) + padMatch[0].length)).trim();

  body = body.replace(/\s+/g, " ").replace(/[\s.,!?;:]+$/g, "").trim();

  if (LAUNCH_VERB.test(body)) {
    const isCreate = /^create/i.test(body);
    const rest = body.replace(LAUNCH_VERB, "").trim();
    const symbolMatch = rest.match(/\$([a-z0-9]{1,10})/i);
    let name = rest.replace(/\$[a-z0-9]{1,10}/i, " ").replace(/\s+/g, " ").trim();
    name = name.replace(/^(?:called|named)\s+/i, "").replace(/[\s.,!?;:-]+$/g, "").trim();
    const symbolFromName = name.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10);
    const symbol = cleanSymbol(symbolMatch?.[1]) || symbolFromName;
    if (!name && symbol) name = symbol;
    if (!symbol) {
      return intent("unknown", raw, {});
    }
    return intent(isCreate ? "createToken" : "launchToken", raw, {
      name,
      symbol,
      launchpad,
      pairToken,
      liquidity,
      devBuy,
      totalSupply,
    });
  }

  if (/^(?:show\s+)?my\s+launches$/i.test(body)) return intent("getLaunches", raw);
  if (/^(?:wallet|show\s+my\s+wallet)$/i.test(body)) return intent("getWallet", raw);
  if (/^(?:portfolio|show\s+my\s+portfolio)$/i.test(body)) return intent("getPortfolio", raw);

  const curve = body.match(/^(?:check|show|get)\s+(?:the\s+)?bonding\s+curve(?:\s+(?:for\s+)?)?\$?([a-z0-9]+)?$/i);
  if (curve) return intent("getBondingCurve", raw, { symbol: cleanSymbol(curve[1]) || null });

  const check = body.match(/^(?:check|show|get|price\s+of)\s+\$?([a-z0-9]+)$/i);
  if (check) return intent("getToken", raw, { symbol: cleanSymbol(check[1]) });

  const buy = body.match(/^buy\s+([0-9]+(?:\.[0-9]+)?)\s+sui\s+(?:of\s+)?\$?([a-z0-9]+)$/i);
  if (buy) return intent("buyToken", raw, { amountSui: Number(buy[1]), symbol: cleanSymbol(buy[2]) });

  const sell = body.match(/^sell\s+([0-9]+(?:\.[0-9]+)?)%\s+(?:of\s+)?\$?([a-z0-9]+)$/i);
  if (sell) return intent("sellToken", raw, { percent: Number(sell[1]), symbol: cleanSymbol(sell[2]) });

  const tx = body.match(/^(?:transaction|tx)\s+([a-z0-9]+)$/i);
  if (tx?.[1]) return intent("getTransaction", raw, { digest: tx[1] });

  return intent("unknown", raw);
}
