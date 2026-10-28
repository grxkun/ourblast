// SPDX-License-Identifier: BUSL-1.1
/**
 * Telegram wallet identity: a linked X account's OurBank wallet if bound,
 * otherwise a native Telegram wallet keyed by numeric Telegram ID (`tg-<id>`).
 * X handles can't contain "-", so `tg-<id>` never collides with an X wallet.
 */
export const tgNativeHandle = (tgUserId: number) => `tg-${tgUserId}`;

export async function tgWalletHandle(tgUserId: number): Promise<string> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data } = await db.from("tg_users").select("x_username").eq("tg_user_id", tgUserId).maybeSingle();
  return data?.x_username ?? tgNativeHandle(tgUserId);
}

/** Telegram usernames never fall back to an X lookup, even when linked. */
export async function tgRecipientAddress(username: string): Promise<string | null> {
  if (!/^[a-z0-9_]{4,32}$/i.test(username)) return null;
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  // Escape LIKE wildcards: an underscore is a literal part of a handle.
  const exact = username.replace(/_/g, "\\_");
  const { data, error } = await db.from("tg_users")
    .select("tg_user_id, x_username").ilike("username", exact).limit(2);
  if (error || !data || data.length !== 1) return null;
  const recipient = data[0];
  if (!recipient?.tg_user_id) return null;
  const { ensureBankWallet } = await import("@/lib/terminal/bank-wallet.server");
  return (await ensureBankWallet(recipient.x_username || tgNativeHandle(recipient.tg_user_id), null)).address;
}

/**
 * When an X account is linked, keep the native Telegram wallet reachable as an
 * extra slot so its funds are never stranded.
 */
export async function keepNativeWalletAsSlot(tgUserId: number): Promise<number | null> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const handle = tgNativeHandle(tgUserId);
  const { data: bw } = await db.from("bank_wallets").select("x_username").eq("x_username", handle).maybeSingle();
  if (!bw) return null;
  const { data: subs } = await db.from("tg_sub_wallets").select("slot, bank_handle").eq("tg_user_id", tgUserId);
  const have = (subs ?? []).find((s) => s.bank_handle === handle);
  if (have) return have.slot;
  const used = new Set((subs ?? []).map((s) => s.slot));
  const { MAX_SLOT } = await import("./multiWallet");
  for (let s = 2; s <= MAX_SLOT; s++) {
    if (!used.has(s)) {
      await db.from("tg_sub_wallets").insert({ tg_user_id: tgUserId, slot: s, label: "Telegram", bank_handle: handle });
      return s;
    }
  }
  return null;
}
