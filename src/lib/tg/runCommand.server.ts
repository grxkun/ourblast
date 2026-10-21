// SPDX-License-Identifier: BUSL-1.1
/** Runs a trading command for a Telegram user as their Privy-verified X account. Shared by the Mini App and the bot chat. */
export async function runTgCommand(tgUserId: number, text: string): Promise<{ reply: string; linked: boolean }> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: row } = await db.from("tg_users").select("x_username").eq("tg_user_id", tgUserId).maybeSingle();
  const handle = row?.x_username;
  if (!handle) return { linked: false, reply: "Link your X account first (open the app → Wallet) — trades use your OurBank wallet." };
  const { ensureBankWallet } = await import("@/lib/terminal/bank-wallet.server");
  await ensureBankWallet(handle, null);
  const postId = `terminal-tg-${crypto.randomUUID()}`;
  const { handleFeeCheckMention, handleFeeClaimMention, handleClaimLinkMention } = await import("@/lib/terminal/xClaim.server");
  const feeReply = (await handleClaimLinkMention(handle, text)) ?? (await handleFeeCheckMention(handle, text)) ?? (await handleFeeClaimMention(handle, text));
  const { handleBankMention } = await import("@/lib/terminal/bank.server");
  const raw = feeReply ?? (await handleBankMention(postId, handle, text)) ?? "";
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
