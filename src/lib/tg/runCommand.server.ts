// SPDX-License-Identifier: BUSL-1.1
/**
 * Runs a trading command for a Telegram user as their Privy-verified X account. Shared by the Mini App and the bot chat.
 * Speed: independent steps (wallet check, module loads, fee-command checks) run in parallel; callers that already
 * know the linked handle pass it to skip a lookup.
 */
export async function runTgCommand(tgUserId: number, text: string, knownHandle?: string | null): Promise<{ reply: string; linked: boolean }> {
  let handle = knownHandle ?? null;
  if (!handle) {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: row } = await db.from("tg_users").select("x_username").eq("tg_user_id", tgUserId).maybeSingle();
    handle = row?.x_username ?? null;
  }
  if (!handle) return { linked: false, reply: "Link your X account first (open the app → Wallet) — trades use your OurBank wallet." };
  const [{ ensureBankWallet }, claim, bank] = await Promise.all([
    import("@/lib/terminal/bank-wallet.server"),
    import("@/lib/terminal/xClaim.server"),
    import("@/lib/terminal/bank.server"),
  ]);
  // Fee handlers return null instantly for unrelated text; run them alongside the wallet check.
  const [, link, check, claimed] = await Promise.all([
    ensureBankWallet(handle, null),
    claim.handleClaimLinkMention(handle, text),
    claim.handleFeeCheckMention(handle, text),
    claim.handleFeeClaimMention(handle, text),
  ]);
  const feeReply = link ?? check ?? claimed;
  const raw = feeReply ?? (await bank.handleBankMention(`terminal-tg-${crypto.randomUUID()}`, handle, text)) ?? "";
  const reply = raw.replace(new RegExp(`^@${handle}\\s+`, "i"), "").trim() ||
    "I couldn't read that. Try: buy 1 sui of $BLAST · sell 50% $BLAST · send 5 sui to @friend · bridge 0.05 sol to sui · balance";
  return { linked: true, reply };
}

/** Live USD prices from Aftermath. Returns {} on any failure — never invents a price. */
export async function aftermathPrices(coinTypes: string[]): Promise<Record<string, number>> {
  if (!coinTypes.length) return {};
  try {
    const res = await fetch("https://aftermath.finance/api/price-info", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ coins: coinTypes }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return {};
    const json = (await res.json()) as Record<string, { price?: number }>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(json)) if (typeof v?.price === "number" && v.price > 0) out[k] = v.price;
    return out;
  } catch {
    return {};
  }
}
