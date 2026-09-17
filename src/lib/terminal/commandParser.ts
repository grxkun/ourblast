import type { ParsedIntent, TerminalIntentName } from "./types";

const cleanSymbol = (value?: string) => (value ?? "").replace(/^\$/, "").toUpperCase();

function intent(name: TerminalIntentName, raw: string, input: ParsedIntent["input"] = {}): ParsedIntent {
  return { name, raw, input, confidence: name === "unknown" ? 0 : 1 };
}

export function parseTerminalCommand(rawInput: string): ParsedIntent {
  const raw = rawInput.trim().replace(/^@ourblast\s+/i, "");
  const launch = raw.match(/^(?:launch|create(?:\s+token)?)\s+(?:a\s+meme\s+coin\s+called\s+)?(?:\$([a-z0-9]{1,10})\s+)?(?:called\s+)?(.+?)(?:\s+\$([a-z0-9]{1,10}))?$/i);
  if (launch) {
    const symbol = cleanSymbol(launch[1] || launch[3]);
    const name = launch[2]?.replace(/^token\s+/i, "").trim() ?? "";
    return intent(/^create/i.test(raw) ? "createToken" : "launchToken", raw, { name, symbol });
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