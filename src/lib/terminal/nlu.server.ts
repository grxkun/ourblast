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
launch $SYMBOL Token Name [on maelstrom|on suipump] [paired with SUI|USDC|BLAST|DEEP|WAL] [with N liquidity] [dev buy N] [supply N] [fee to @handle|fee to 0xADDRESS]
create $SYMBOL Token Name
check $SYMBOL
check bonding curve $SYMBOL
buy N sui of $SYMBOL
sell N% of $SYMBOL
my launches
wallet
portfolio
tx DIGEST

Rules:
- Output the command only. No quotes, no explanation, no markdown.
- Invent nothing: if the symbol or the intent is unclear, output NONE.
- A token name written in words with no ticker becomes a symbol built from that name.
- Never output anything outside the shapes above.`;

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
        max_tokens: 60,
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
