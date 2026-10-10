// SPDX-License-Identifier: BUSL-1.1
import { Transaction } from "@mysten/sui/transactions";
import { normalizeStructTag, normalizeSuiAddress } from "@mysten/sui/utils";

import { BLAST_BUILD } from "@/lib/blast-build.config";
import { DEFAULT_TREASURY_ADDRESS } from "@/lib/ourblast.config";
import { toAtomic } from "./bank";
import { ESCROW_FEE_BPS, escrowLegPayout, parseEscrowCancel, parseEscrowCommand } from "./escrow";

/**
 * OTC escrow: each deal gets its own one-time bot-held wallet. It settles
 * automatically once both legs are deposited, minus 0.5% per leg to the
 * treasury. Unfunded deals refund after 24h or on "cancel escrow #N".
 * Payouts and refunds go to each party's OurBank wallet. Gas is sponsored by
 * the bot so the escrow wallet holds exactly what was deposited.
 */
const SUI = normalizeStructTag("0x2::sui::SUI");
const KNOWN: Record<string, string> = {
  SUI,
  USDC: normalizeStructTag("0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC"),
  BLAST: normalizeStructTag(BLAST_BUILD.blastTokenType),
};

async function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}
const chain = () => import("./suipump-launch.server");
const wallets = () => import("./bank-wallet.server");

const treasury = () => {
  const env = process.env["OURBLAST_TREASURY_ADDRESS"];
  return env && env.startsWith("0x") ? env : DEFAULT_TREASURY_ADDRESS;
};

async function resolveToken(token: string, holder: string): Promise<{ coinType: string; symbol: string; decimals: number } | null> {
  const { rpc } = await chain();
  let type: string | null = token.includes("::") ? normalizeStructTag(token) : (KNOWN[token] ?? null);
  if (!type) {
    // Unknown symbol: accept it only when the party's OurBank wallet holds exactly one coin by that name.
    const { findBankWallet } = await wallets();
    const w = await findBankWallet(holder);
    if (!w) return null;
    const { matchCoins } = await import("./bank.server");
    const matches = await matchCoins(w.address, { token, isCoinType: false });
    if (matches.length !== 1) return null;
    type = matches[0]!.coinType;
  }
  const meta = await rpc<{ symbol: string; decimals: number } | null>("suix_getCoinMetadata", [type]).catch(() => null);
  if (!meta) return null;
  return { coinType: type, symbol: meta.symbol.toUpperCase(), decimals: meta.decimals };
}

const fmt = (atomic: bigint | string, decimals: number) => {
  const v = BigInt(atomic);
  const s = v.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
};

/** Returns a reply for escrow tweets, or null when the tweet isn't about escrow. */
export async function handleEscrowMention(postId: string, username: string, text: string): Promise<string | null> {
  const me = username.toLowerCase();
  const cancelNo = parseEscrowCancel(text);
  if (cancelNo !== null) return cancelEscrow(cancelNo, me);

  const cmd = parseEscrowCommand(text, me);
  if (!cmd) {
    if (/\b(?:escrow|otc)\b/i.test(text)) {
      return `@${username} to open an escrow try: escrow with @friend 10 SUI for 50000 $BLAST`;
    }
    return null;
  }

  const sb = await db();
  const { data: existing } = await sb.from("escrows").select("number").eq("x_post_id", postId).maybeSingle();
  if (existing) return "";

  const [a, b] = await Promise.all([resolveToken(cmd.aToken, me), resolveToken(cmd.bToken, cmd.counterparty)]);
  if (!a) return `@${username} I couldn't identify ${cmd.aToken}. Use SUI, USDC, $BLAST or the full coin type (0x…::coin::COIN).`;
  if (!b) return `@${username} I couldn't identify ${cmd.bToken}. Use SUI, USDC, $BLAST or the full coin type (0x…::coin::COIN).`;
  if (a.coinType === b.coinType) return `@${username} both sides of an escrow must be different tokens.`;

  let aAtomic: bigint, bAtomic: bigint;
  try {
    aAtomic = toAtomic(cmd.aAmount, a.decimals);
    bAtomic = toAtomic(cmd.bAmount, b.decimals);
  } catch {
    return `@${username} I couldn't read those amounts.`;
  }

  const { ensureBankWallet } = await wallets();
  // Both parties need an OurBank wallet to receive payouts and refunds.
  await Promise.all([ensureBankWallet(me, null), ensureBankWallet(cmd.counterparty, null)]);
  const handle = `escrow-${postId}`;
  const escrowWallet = await ensureBankWallet(handle, null);

  const { data: row, error } = await sb
    .from("escrows")
    .insert({
      x_post_id: postId,
      party_a: me,
      party_b: cmd.counterparty,
      a_coin_type: a.coinType, a_symbol: a.symbol, a_decimals: a.decimals, a_amount_atomic: aAtomic.toString(),
      b_coin_type: b.coinType, b_symbol: b.symbol, b_decimals: b.decimals, b_amount_atomic: bAtomic.toString(),
      escrow_handle: handle,
      escrow_address: escrowWallet.address,
      fee_bps: Number(ESCROW_FEE_BPS),
    })
    .select("number")
    .single();
  if (error?.code === "23505") return "";
  if (error) throw new Error(error.message);

  return (
    `@${username} escrow #${row.number} is open with @${cmd.counterparty}.\n\n` +
    `@${username} deposits ${cmd.aAmount} ${a.symbol}\n@${cmd.counterparty} deposits ${cmd.bAmount} ${b.symbol}\n\n` +
    `Send to: ${escrowWallet.address}\n\n` +
    `Settles automatically when both land (0.5% fee). Not funded in 24h = full refund. Cancel: "cancel escrow #${row.number}"`
  );
}

interface EscrowRow {
  id: string; number: number; x_post_id: string; party_a: string; party_b: string;
  a_coin_type: string; a_symbol: string; a_decimals: number; a_amount_atomic: string;
  b_coin_type: string; b_symbol: string; b_decimals: number; b_amount_atomic: string;
  escrow_handle: string; escrow_address: string; fee_bps: number; status: string; expires_at: string;
}

async function cancelEscrow(number: number, by: string): Promise<string> {
  const sb = await db();
  const { data: row } = await sb.from("escrows").select("*").eq("number", number).maybeSingle();
  if (!row) return `@${by} escrow #${number} doesn't exist.`;
  if (row.party_a !== by && row.party_b !== by) return `@${by} only the two parties of escrow #${number} can cancel it.`;
  if (row.status !== "AWAITING_DEPOSITS") return `@${by} escrow #${number} is already ${row.status.toLowerCase()}.`;
  const { data: claimed } = await sb.from("escrows").update({ status: "REFUNDING" }).eq("id", row.id).eq("status", "AWAITING_DEPOSITS").select("id").maybeSingle();
  if (!claimed) return `@${by} escrow #${number} just changed state; check again in a minute.`;
  const r = await refund(row as EscrowRow, "cancelled");
  return r;
}

async function heldBy(address: string) {
  const { bankBalances } = await wallets();
  const list = await bankBalances(address);
  const map = new Map<string, bigint>();
  for (const b of list) map.set(normalizeStructTag(b.coinType), b.balance);
  return map;
}

type Move = { coinType: string; amount: bigint | null; to: string };

/** One sponsored transaction moving coins out of the escrow wallet. amount null = whatever is left. */
async function moveOut(row: EscrowRow, moves: Move[]): Promise<{ ok: true; digest: string } | { ok: false; error: string }> {
  const { rpc, gasCoins, referenceGasPrice, withSponsoredGas, signAndExecute, loadDeployer } = await chain();
  const { findBankWallet, bankSigner } = await wallets();
  const wallet = await findBankWallet(row.escrow_handle);
  if (!wallet) return { ok: false, error: "Escrow wallet missing." };
  const signer = await bankSigner(wallet);
  const sponsor = await loadDeployer();
  if (!sponsor) return { ok: false, error: "Bot gas wallet unavailable." };
  const sponsorAddr = sponsor.getPublicKey().toSuiAddress();
  const gas = await gasCoins(sponsorAddr);
  if (!gas.length) return { ok: false, error: "Bot gas wallet has no SUI." };

  const tx = new Transaction();
  withSponsoredGas(tx, signer.address, sponsorAddr, gas, await referenceGasPrice(), 20_000_000);
  const byType = new Map<string, Move[]>();
  for (const m of moves) byType.set(m.coinType, [...(byType.get(m.coinType) ?? []), m]);
  for (const [type, list] of byType) {
    const page = await rpc<{ data: { coinObjectId: string; version: string; digest: string }[] }>("suix_getCoins", [signer.address, type, null, 50]);
    const coins = page.data ?? [];
    if (!coins.length) continue;
    const refs = coins.map((c) => tx.objectRef({ objectId: c.coinObjectId, version: String(c.version), digest: c.digest }));
    const [primary, ...rest] = refs;
    if (rest.length) tx.mergeCoins(primary!, rest);
    let remainderTo: string | null = null;
    for (const m of list) {
      if (m.amount === null) remainderTo = m.to;
      else if (m.amount > 0n) tx.transferObjects([tx.splitCoins(primary!, [tx.pure.u64(m.amount)])[0]!], tx.pure.address(normalizeSuiAddress(m.to)));
    }
    if (remainderTo) tx.transferObjects([primary!], tx.pure.address(normalizeSuiAddress(remainderTo)));
  }
  const res = await signAndExecute(tx, signer, sponsor);
  if (!res.ok || !res.digest) return { ok: false, error: res.error ?? "Transaction failed." };
  return { ok: true, digest: res.digest };
}

async function partyAddress(handle: string) {
  const { ensureBankWallet } = await wallets();
  return (await ensureBankWallet(handle, null)).address;
}

async function refund(row: EscrowRow, why: "cancelled" | "expired"): Promise<string> {
  const sb = await db();
  const held = await heldBy(row.escrow_address);
  const moves: Move[] = [];
  if ((held.get(row.a_coin_type) ?? 0n) > 0n) moves.push({ coinType: row.a_coin_type, amount: null, to: await partyAddress(row.party_a) });
  if ((held.get(row.b_coin_type) ?? 0n) > 0n) moves.push({ coinType: row.b_coin_type, amount: null, to: await partyAddress(row.party_b) });
  const label = why === "cancelled" ? "cancelled" : "expired after 24h";
  if (!moves.length) {
    await sb.from("escrows").update({ status: "REFUNDED", error: null }).eq("id", row.id);
    return `@${row.party_a} @${row.party_b} escrow #${row.number} ${label}. Nothing was deposited.`;
  }
  const r = await moveOut(row, moves);
  if (!r.ok) {
    await sb.from("escrows").update({ error: r.error }).eq("id", row.id);
    return `@${row.party_a} @${row.party_b} escrow #${row.number} ${label}; refund is retrying.`;
  }
  await sb.from("escrows").update({ status: "REFUNDED", tx_digest: r.digest, error: null }).eq("id", row.id);
  return `@${row.party_a} @${row.party_b} escrow #${row.number} ${label}. Deposits returned to your OurBank wallets ✅ https://suiscan.xyz/mainnet/tx/${r.digest}`;
}

async function settle(row: EscrowRow, held: Map<string, bigint>): Promise<string | null> {
  const sb = await db();
  const fee = BigInt(row.fee_bps);
  const legA = escrowLegPayout(BigInt(row.a_amount_atomic), held.get(row.a_coin_type) ?? 0n, fee);
  const legB = escrowLegPayout(BigInt(row.b_amount_atomic), held.get(row.b_coin_type) ?? 0n, fee);
  const [aAddr, bAddr] = await Promise.all([partyAddress(row.party_a), partyAddress(row.party_b)]);
  const t = treasury();
  const r = await moveOut(row, [
    { coinType: row.a_coin_type, amount: legA.toCounterparty, to: bAddr },
    { coinType: row.a_coin_type, amount: legA.fee, to: t },
    { coinType: row.a_coin_type, amount: null, to: aAddr },
    { coinType: row.b_coin_type, amount: legB.toCounterparty, to: aAddr },
    { coinType: row.b_coin_type, amount: legB.fee, to: t },
    { coinType: row.b_coin_type, amount: null, to: bAddr },
  ]);
  if (!r.ok) {
    await sb.from("escrows").update({ status: "AWAITING_DEPOSITS", error: r.error }).eq("id", row.id);
    return null;
  }
  await sb.from("escrows").update({ status: "SETTLED", tx_digest: r.digest, error: null }).eq("id", row.id);
  return (
    `@${row.party_a} @${row.party_b} escrow #${row.number} settled ✅\n\n` +
    `@${row.party_a} got ${fmt(legB.toCounterparty, row.b_decimals)} ${row.b_symbol}\n` +
    `@${row.party_b} got ${fmt(legA.toCounterparty, row.a_decimals)} ${row.a_symbol}\n\n` +
    `https://suiscan.xyz/mainnet/tx/${r.digest}`
  );
}

async function announce(row: EscrowRow, text: string) {
  const { readXCredentials, postReply } = await import("./x-api.server");
  const creds = readXCredentials();
  if (!creds) return;
  try {
    const id = await postReply(creds, row.x_post_id, text);
    const sb = await db();
    await sb.from("escrows").update({ final_reply_post_id: id }).eq("id", row.id);
  } catch (e) {
    console.error(`Escrow #${row.number} reply failed: ${(e as Error).message}`);
  }
}

/** Runs on every poll: settles funded deals, refunds expired ones, retries failed refunds. */
export async function maintainEscrows() {
  const sb = await db();
  const { data } = await sb.from("escrows").select("*").in("status", ["AWAITING_DEPOSITS", "REFUNDING"]).limit(25);
  for (const row of (data ?? []) as EscrowRow[]) {
    try {
      if (row.status === "REFUNDING") {
        const text = await refund(row, "cancelled");
        if (!text.includes("retrying")) await announce(row, text);
        continue;
      }
      const held = await heldBy(row.escrow_address);
      const funded =
        (held.get(row.a_coin_type) ?? 0n) >= BigInt(row.a_amount_atomic) &&
        (held.get(row.b_coin_type) ?? 0n) >= BigInt(row.b_amount_atomic);
      if (funded) {
        const { data: claimed } = await sb.from("escrows").update({ status: "SETTLING" }).eq("id", row.id).eq("status", "AWAITING_DEPOSITS").select("id").maybeSingle();
        if (!claimed) continue;
        const text = await settle(row, held);
        if (text) await announce(row, text);
      } else if (new Date(row.expires_at).getTime() < Date.now()) {
        const { data: claimed } = await sb.from("escrows").update({ status: "REFUNDING" }).eq("id", row.id).eq("status", "AWAITING_DEPOSITS").select("id").maybeSingle();
        if (!claimed) continue;
        const text = await refund(row, "expired");
        if (!text.includes("retrying")) await announce(row, text);
      }
    } catch (e) {
      console.error(`Escrow #${row.number} maintenance failed: ${(e as Error).message}`);
    }
  }
}
