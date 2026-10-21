// SPDX-License-Identifier: BUSL-1.1
/** Multi-wallet for one Telegram account: extra bot-held Sui wallets and which ones trades run from. */
import { MAX_SLOT, subHandle } from "./multiWallet";

export type TgWallet = { slot: number; label: string; handle: string };

async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export async function listTgWallets(tgUserId: number, xHandle: string): Promise<{ wallets: TgWallet[]; selected: number[] }> {
  const d = await db();
  const [{ data: subs }, { data: u }] = await Promise.all([
    d.from("tg_sub_wallets").select("slot, label, bank_handle").eq("tg_user_id", tgUserId).order("slot"),
    d.from("tg_users").select("trade_slots").eq("tg_user_id", tgUserId).maybeSingle(),
  ]);
  const wallets: TgWallet[] = [{ slot: 1, label: "Main", handle: xHandle }, ...(subs ?? []).map((s) => ({ slot: s.slot, label: s.label ?? `Wallet ${s.slot}`, handle: s.bank_handle }))];
  const have = new Set(wallets.map((w) => w.slot));
  const selected = (u?.trade_slots ?? [1]).filter((s) => have.has(s));
  return { wallets, selected: selected.length ? selected : [1] };
}

export async function createTgWallet(tgUserId: number, label: string | null): Promise<{ ok: true; wallet: TgWallet; address: string } | { ok: false; error: string }> {
  const d = await db();
  const { data: subs } = await d.from("tg_sub_wallets").select("slot").eq("tg_user_id", tgUserId);
  const used = new Set((subs ?? []).map((s) => s.slot));
  let slot = 0;
  for (let s = 2; s <= MAX_SLOT; s++) if (!used.has(s)) { slot = s; break; }
  if (!slot) return { ok: false, error: `You already have ${MAX_SLOT} wallets (the max).` };
  const handle = subHandle(tgUserId, slot);
  const { ensureBankWallet } = await import("@/lib/terminal/bank-wallet.server");
  const w = await ensureBankWallet(handle, null);
  const { error } = await d.from("tg_sub_wallets").insert({ tg_user_id: tgUserId, slot, label, bank_handle: handle });
  if (error) return { ok: false, error: "Couldn't save the wallet. Try again." };
  return { ok: true, wallet: { slot, label: label ?? `Wallet ${slot}`, handle }, address: w.address };
}

export async function setTradeSlots(tgUserId: number, xHandle: string, slots: number[] | "all"): Promise<{ ok: boolean; selected: number[]; error?: string }> {
  const { wallets } = await listTgWallets(tgUserId, xHandle);
  const have = new Set(wallets.map((w) => w.slot));
  const pick = slots === "all" ? [...have] : slots;
  const missing = pick.filter((s) => !have.has(s));
  if (missing.length) return { ok: false, selected: [], error: `You don't have wallet ${missing.join(", ")}. Create one with: newwallet name` };
  await (await db()).from("tg_users").update({ trade_slots: pick }).eq("tg_user_id", tgUserId);
  return { ok: true, selected: pick };
}

/** Wallets a trade runs from: the explicit slot, else the selection. Unknown slots are dropped, never guessed. */
export async function tradeTargets(tgUserId: number, xHandle: string, slots?: number[]): Promise<TgWallet[]> {
  const { wallets, selected } = await listTgWallets(tgUserId, xHandle);
  const want = new Set(slots ?? selected);
  return wallets.filter((w) => want.has(w.slot));
}

export async function walletsReply(tgUserId: number, xHandle: string): Promise<string> {
  const { wallets, selected } = await listTgWallets(tgUserId, xHandle);
  const [{ ensureBankWallet, bankBalances }] = await Promise.all([import("@/lib/terminal/bank-wallet.server")]);
  const rows = await Promise.all(wallets.map(async (w) => {
    const bw = await ensureBankWallet(w.handle, null);
    const bal = await bankBalances(bw.address).catch(() => null);
    const sui = bal?.find((b) => /^0x0*2::sui::SUI$/.test(b.coinType));
    const amt = bal ? (Number(sui?.balance ?? 0) / 1e9).toLocaleString("en-US", { maximumFractionDigits: 4 }) : "?";
    return `${selected.includes(w.slot) ? "✅" : "▫️"} w${w.slot} · ${w.label} — ${amt} SUI\n${bw.address}`;
  }));
  return `👛 Your Sui wallets (${wallets.length}/${MAX_SLOT})\n\n${rows.join("\n\n")}\n\n✅ = trades run from it. Buys spend the amount from each ✅ wallet; sells sell that % in each.\n• use 1,2 · use all — choose wallets\n• newwallet name — add a wallet\n• w2 sell 50% 0x… — trade from one wallet\n• Fund a wallet: send 5 sui to 0x… (its address)`;
}
