import type { ParsedIntent, TerminalIntentName } from "./types";

const cleanSymbol = (value?: string) => (value ?? "").replace(/^\$/, "").toUpperCase();

function intent(name: TerminalIntentName, raw: string, input: ParsedIntent["input"] = {}): ParsedIntent {
  return { name, raw, input, confidence: name === "unknown" ? 0 : 1 };
}

export function parseTerminalCommand(rawInput: string): ParsedIntent {
  const raw = rawInput.trim().replace(/^@ourblast(?:bot)?\s+/i, "");

  // Optional "... paired with USDC" / "... pair $BLAST" / "... lp usdc" custom LP pairing.
  let body = raw;
  const pairMatch = body.match(/\s+(?:paired\s+with|pair(?:ed)?(?:\s+against)?|lp)\s+\$?([a-z0-9]{2,10})\b/i);
  const pairToken = pairMatch?.[1]?.toUpperCase() ?? null;
  if (pairMatch) body = (body.slice(0, pairMatch.index) + body.slice((pairMatch.index ?? 0) + pairMatch[0].length)).trim();

  // Optional "... on maelstrom" / "... on strom" / "... on suipump" pad selection.
  const padMatch = body.match(/\s+on\s+(maelstrom|strom|mael|suipump|pump)(?:\.(?:org|sui\.io))?\s*$/i);
  const launchpad = padMatch?.[1]?.toLowerCase() ?? null;
  if (padMatch) body = body.slice(0, padMatch.index).trim();


  const launch = body.match(/^(?:launch|create(?:\s+token)?)\s+(?:a\s+meme\s+coin\s+called\s+)?(?:\$([a-z0-9]{1,10})\s+)?(?:called\s+)?(.+?)(?:\s+\$([a-z0-9]{1,10}))?$/i);
  if (launch) {
    const name = launch[2]?.replace(/^token\s+/i, "").trim() ?? "";
    const symbol = cleanSymbol(launch[1] || launch[3]) || name.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10);
    return intent(/^create/i.test(body) ? "createToken" : "launchToken", raw, { name, symbol, launchpad, pairToken });
  }

  if (/^(?:show\s+)?my\s+launches$/i.test(raw)) return intent("getLaunches", raw);
  if (/^(?:wallet|show\s+my\s+wallet)$/i.test(raw)) return intent("getWallet", raw);
  if (/^(?:portfolio|show\s+my\s+portfolio)$/i.test(raw)) return intent("getPortfolio", raw);

  const curve = raw.match(/^(?:check|show|get)\s+(?:the\s+)?bonding\s+curve(?:\s+(?:for\s+)?)?\$?([a-z0-9]+)?$/i);
  if (curve) return intent("getBondingCurve", raw, { symbol: cleanSymbol(curve[1]) || null });

  const check = raw.match(/^(?:check|show|get)\s+\$?([a-z0-9]+)$/i);
  if (check) return intent("getToken", raw, { symbol: cleanSymbol(check[1]) });

  const buy = raw.match(/^buy\s+([0-9]+(?:\.[0-9]+)?)\s+sui\s+(?:of\s+)?\$?([a-z0-9]+)$/i);
  if (buy) return intent("buyToken", raw, { amountSui: Number(buy[1]), symbol: cleanSymbol(buy[2]) });

  const sell = raw.match(/^sell\s+([0-9]+(?:\.[0-9]+)?)%\s+(?:of\s+)?\$?([a-z0-9]+)$/i);
  if (sell) return intent("sellToken", raw, { percent: Number(sell[1]), symbol: cleanSymbol(sell[2]) });

  const tx = raw.match(/^(?:transaction|tx)\s+([a-z0-9]+)$/i);
  if (tx?.[1]) return intent("getTransaction", raw, { digest: tx[1] });

  return intent("unknown", raw);
}