/**
 * Intelligent fallback for free-form requests the rule-based parser cannot read.
 *
 * It never executes anything: it only rewrites messy human phrasing into one of
 * the terminal's canonical commands, which is then parsed and checked by the
 * normal allowlisted parser + tool registry. If the model answers with anything
 * unexpected, we return null and the terminal replies with its usual help.
 */

const MODEL = "google/gemini-2.5-flash";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const SYSTEM = `You translate a crypto user's free-form message into EXACTLY ONE canonical command for the OURBLAST Sui terminal, or the single word NONE.

Allowed command shapes (copy the shape, fill the values):
launch $SYMBOL Token Name [on maelstrom|on suipump|on blastfun|on perpsplexity] [paired with SUI|USDC|BLAST|DEEP|WAL] [with N liquidity] [dev buy N] [supply N] [fee to @handle|fee to 0xADDRESS] [description: TEXT]
launch on perpsplexity, $SYMBOL, Token Name, UNDERLYING, Long Nx|Short Nx, dev buy N USDC
create $SYMBOL Token Name
check $SYMBOL
check bonding curve $SYMBOL
check fees on $SYMBOL
claim my fees on $SYMBOL
buy N sui of $SYMBOL
sell N% of $SYMBOL
send N SUI to @handle
send N SUI to 0xADDRESS
my launches
wallet
portfolio
tx DIGEST

Rules:
- Output the command only. No quotes, no explanation, no markdown.
- The symbol always keeps its $ prefix, and a launch always keeps the token name after it.
- Invent nothing: if the symbol or the intent is unclear, output NONE.
- A token name written in words with no ticker becomes a symbol built from that name.
- Perpsplexity launches need an underlying market (e.g. SAMSUNG, NVDA, BYD, US100), a direction (Long or Short) and leverage (e.g. 3x). Dev buys there are always USDC.
- Never output anything outside the shapes above.

Examples:
"yo can u make me a coin for my cat named Tety Yety, ticker TETY, on suipump" -> launch $TETY Tety Yety on suipump
"deploy sui doggo token, 50 sui lp against usdc, send fees to @alice" -> launch $DOGGO Sui Doggo paired with USDC with 50 liquidity fee to @alice
"gimme a 3x long nvda coin called Nvidia Bull ticker NVBULL, first buy 10 usdc" -> launch on perpsplexity, $NVBULL, Nvidia Bull, NVDA, Long 3x, dev buy 10 USDC
"how much fees did HOLMOT make for me" -> check fees on $HOLMOT
"pls claim the fees from holmot and send to me" -> claim my fees on $HOLMOT
"shoot 5 sui over to @bob" -> send 5 SUI to @bob
"how much is blast worth rn" -> check $BLAST
"wen moon ser" -> NONE`;

const GUIDE_SYSTEM = `You are @Ourblastbot, the OURBLAST launch bot on Sui. A user tagged you with a message the command parser could not read.

Decide: is this person trying to use the bot (launch a token, trade, send funds, claim creator fees, or asking how it works), or is it casual chatter, a meme, an insult or spam?

If they are trying to use the bot OR asking a question about it, reply with ONE friendly tweet under 240 characters that names the exact command they should post. Use these shapes:
- launch $TICKER Token Name on suipump  (pads: suipump, blastfun, maelstrom, perpsplexity)
- launch on Perpsplexity, $TICKER, Token Name, SAMSUNG, Long 3x, Dev buy 5 USDC
- buy me TOKEN_ADDRESS with 1 SUI / sell 50% TOKEN_ADDRESS
- send 5 SUI to @handle
- claim my fees on $TICKER

If it is casual chatter, a meme, an insult or spam, answer with the single word NONE.

Rules:
- Never promise a launch, never claim anything happened on-chain, never invent tickers, prices or links.
- Use at most one $ticker in the whole reply.
- Plain text only, no markdown, no hashtags, one short paragraph.`;

export async function interpretFreeText(text: string): Promise<string | null> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  const clean = text.trim().slice(0, 500);
  if (!apiKey || clean.length < 3) return null;

  try {
    const response = await fetch(GATEWAY, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 512,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: clean },
        ],
      }),
    });
    if (!response.ok) {
      console.error(`Terminal NLU failed [${response.status}]: ${(await response.text()).slice(0, 300)}`);
      return null;
    }
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = (payload.choices?.[0]?.message?.content ?? "").trim().split("\n")[0]?.trim() ?? "";
    const candidate = raw.replace(/^[`"'*\s]+|[`"'*\s]+$/g, "");
    if (!candidate || /^none$/i.test(candidate) || candidate.length > 200) return null;
    return candidate;
  } catch (error) {
    console.error(`Terminal NLU error: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}
