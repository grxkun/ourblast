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

/**
 * When an X account is linked, keep the native Telegram wallet reachable as an
 * extra slot so its funds are never stranded.
 */
export async function keepNativeWalletAsSlot(tgUserId: number): Promise<void> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const handle = tgNativeHandle(tgUserId);
  const { data: bw } = await db.from("bank_wallets").select("x_username").eq("x_username", handle).maybeSingle();
  if (!bw) return;
  const { data: subs } = await db.from("tg_sub_wallets").select("slot, bank_handle").eq("tg_user_id", tgUserId);
  if ((subs ?? []).some((s) => s.bank_handle === handle)) return;
  const used = new Set((subs ?? []).map((s) => s.slot));
  const { MAX_SLOT } = await import("./multiWallet");
  for (let s = 2; s <= MAX_SLOT; s++) {
    if (!used.has(s)) {
      await db.from("tg_sub_wallets").insert({ tg_user_id: tgUserId, slot: s, label: "Telegram", bank_handle: handle });
      return;
    }
  }
}
