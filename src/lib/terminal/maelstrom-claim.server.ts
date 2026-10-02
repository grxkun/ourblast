// SPDX-License-Identifier: BUSL-1.1
/**
 * Maelstrom (STROM) creator-fee claims with the OurBlast 80/10/10 split.
 *
 * Maelstrom pushes each launch's creator share of LP fees to one address (the
 * Launch's fee_recipient) whenever anyone calls collect — Maelstrom's own
 * keeper does this regularly. The bot is that recipient, so fees land in the
 * bot wallet. The Launch object keeps a running total (earned_coin /
 * earned_quote) and its creator_fee_bps, so the creator share ever earned is
 * exact and on-chain; the bot pays out (share − already paid) 80/10/10 and
 * records what it paid so nothing is ever paid twice.
 */
import { Transaction } from "@mysten/sui/transactions";

import { MAELSTROM_ORIGINAL_PACKAGE_ID } from "./maelstrom";
import { splitAmounts } from "./popular-claim.server";
import { gasCoins, loadDeployer, normalizeType, referenceGasPrice, rpc, signAndExecute, withGas } from "./suipump-launch.server";

const CLAIM_BUDGET = 60_000_000n;
const SUI = "0x2::sui::SUI";

export interface MaelstromLaunchFees {
  launchId: string;
  coinType: string;
  quoteType: string;
  feeRecipient: string;
  /** Creator share ever earned, in base units. */
  creatorCoin: bigint;
  creatorQuote: bigint;
}

export async function readMaelstromLaunchFees(launchId: string): Promise<MaelstromLaunchFees | null> {
  const obj = await rpc<{ data?: { type?: string; content?: { fields?: Record<string, unknown> } } }>("sui_getObject", [
    launchId,
    { showType: true, showContent: true },
  ]).catch(() => null);
  const type = obj?.data?.type ?? "";
  const m = type.match(/::launchpad::Launch<(.+),\s*(.+)>$/);
  const fields = obj?.data?.content?.fields;
  if (!m || !fields) return null;
  const bps = BigInt(String(fields["creator_fee_bps"] ?? "0"));
  const earnedCoin = BigInt(String(fields["earned_coin"] ?? "0"));
  const earnedQuote = BigInt(String(fields["earned_quote"] ?? "0"));
  return {
    launchId,
    coinType: normalizeType(m[1]!.trim()),
    quoteType: normalizeType(m[2]!.trim()),
    feeRecipient: String(fields["fee_recipient"] ?? "").toLowerCase(),
    creatorCoin: (earnedCoin * bps) / 10_000n,
    creatorQuote: (earnedQuote * bps) / 10_000n,
  };
}

/** Finds the Launch object for a pool from Maelstrom's Launched events (older rows didn't store it). */
export async function findMaelstromLaunchId(poolId: string): Promise<string | null> {
  let cursor: unknown = null;
  for (let page = 0; page < 20; page += 1) {
    const res = await rpc<{
      data: { parsedJson?: Record<string, unknown> }[];
      hasNextPage: boolean;
      nextCursor: unknown;
    }>("suix_queryEvents", [
      { MoveEventType: `${MAELSTROM_ORIGINAL_PACKAGE_ID}::launchpad::Launched` },
      cursor,
      50,
      true,
    ]).catch(() => null);
    if (!res) return null;
    const hit = res.data.find((e) => String(e.parsedJson?.["pool_id"] ?? "").toLowerCase() === poolId.toLowerCase());
    if (hit) return String(hit.parsedJson?.["launch_id"]);
    if (!res.hasNextPage) return null;
    cursor = res.nextCursor;
  }
  return null;
}

async function ownedCoins(owner: string, coinType: string) {
  const res = await rpc<{ data: { coinObjectId: string; version: string; digest: string; balance: string }[] }>(
    "suix_getCoins",
    [owner, coinType, null, 200],
  );
  return res.data;
}

export interface MaelstromOwed {
  fees: MaelstromLaunchFees;
  owedCoin: bigint;
  owedQuote: bigint;
}

export async function maelstromOwed(launchId: string, paidCoin: bigint, paidQuote: bigint): Promise<MaelstromOwed | null> {
  const fees = await readMaelstromLaunchFees(launchId);
  if (!fees) return null;
  const owedCoin = fees.creatorCoin > paidCoin ? fees.creatorCoin - paidCoin : 0n;
  const owedQuote = fees.creatorQuote > paidQuote ? fees.creatorQuote - paidQuote : 0n;
  return { fees, owedCoin, owedQuote };
}

export interface MaelstromClaimResult {
  ok: boolean;
  message: string;
  digest: string | null;
  paidCoin: bigint;
  paidQuote: bigint;
  quoteType: string | null;
}

/**
 * Pays the launch's unpaid creator fees 80/10/10 from the bot wallet in one
 * transaction. Returns what was paid; the caller records it.
 */
export async function payMaelstromCreatorFees(
  launchId: string,
  paidCoin: bigint,
  paidQuote: bigint,
  payees: string[],
  shareBps: number[],
): Promise<MaelstromClaimResult> {
  const none = (message: string): MaelstromClaimResult => ({ ok: false, message, digest: null, paidCoin: 0n, paidQuote: 0n, quoteType: null });
  const keypair = await loadDeployer();
  const bot = keypair?.getPublicKey().toSuiAddress().toLowerCase();
  if (!keypair || !bot) return none("the bot wallet is not configured");
  if (payees.length === 0 || payees.length !== shareBps.length) return none("the fee split is not set");

  const owed = await maelstromOwed(launchId, paidCoin, paidQuote);
  if (!owed) return none("the STROM launch could not be read");
  if (owed.fees.feeRecipient !== bot) {
    return none("fees on this token go straight to the launcher's own wallet");
  }

  const [gas, gasPrice, tokenCoins] = await Promise.all([
    gasCoins(bot),
    referenceGasPrice(),
    ownedCoins(bot, owed.fees.coinType).catch(() => []),
  ]);
  if (gas.length === 0) return none("the bot wallet has no SUI for gas");

  // Never pay more than the bot actually holds of each side.
  const tokenBal = tokenCoins.reduce((a, c) => a + BigInt(c.balance), 0n);
  const payCoin = owed.owedCoin <= tokenBal ? owed.owedCoin : tokenBal;
  const quoteIsSui = owed.fees.quoteType === SUI;
  let payQuote = owed.owedQuote;
  let quoteCoins: Awaited<ReturnType<typeof ownedCoins>> = [];
  if (quoteIsSui) {
    const bal = await rpc<{ totalBalance: string }>("suix_getBalance", [bot, SUI]).catch(() => ({ totalBalance: "0" }));
    const suiBal = BigInt(bal.totalBalance);
    const spendable = suiBal > CLAIM_BUDGET * 2n ? suiBal - CLAIM_BUDGET * 2n : 0n;
    if (payQuote > spendable) payQuote = spendable;
  } else if (payQuote > 0n) {
    quoteCoins = await ownedCoins(bot, owed.fees.quoteType).catch(() => []);
    const bal = quoteCoins.reduce((a, c) => a + BigInt(c.balance), 0n);
    if (payQuote > bal) payQuote = bal;
  }
  if (payCoin <= 0n && payQuote <= 0n) return none("no fees waiting yet");

  const tx = new Transaction();
  withGas(tx, bot, gas, gasPrice, Number(CLAIM_BUDGET));
  const payOut = (source: ReturnType<Transaction["object"]> | ReturnType<Transaction["splitCoins"]>[number], total: bigint) => {
    const amounts = splitAmounts(total, shareBps);
    const parts = tx.splitCoins(source as never, amounts.map((a) => tx.pure.u64(a)));
    payees.forEach((payee, i) => tx.transferObjects([parts[i]!], payee));
  };
  if (payCoin > 0n) {
    const refs = tokenCoins.map((c) => tx.objectRef({ objectId: c.coinObjectId, version: c.version, digest: c.digest }));
    if (refs.length > 1) tx.mergeCoins(refs[0]!, refs.slice(1));
    payOut(refs[0]!, payCoin);
  }
  if (payQuote > 0n) {
    if (quoteIsSui) {
      payOut(tx.gas as never, payQuote);
    } else {
      const refs = quoteCoins.map((c) => tx.objectRef({ objectId: c.coinObjectId, version: c.version, digest: c.digest }));
      if (refs.length > 1) tx.mergeCoins(refs[0]!, refs.slice(1));
      payOut(refs[0]!, payQuote);
    }
  }

  const run = await signAndExecute(tx, keypair);
  if (!run.ok) return { ...none(run.error ?? "the payout failed on chain"), digest: run.digest ?? null };
  return { ok: true, message: "paid", digest: run.digest ?? null, paidCoin: payCoin, paidQuote: payQuote, quoteType: owed.fees.quoteType };
}

/** Row-level helper used by X and terminal claims: resolves the launch, pays, records. */
export async function claimMaelstromRow(row: {
  symbol: string;
  x_username: string;
  fee_receiver_x_username: string | null;
  fee_receiver_wallet: string | null;
  pool_object_id: string | null;
  maelstrom_launch_id: string | null;
  fees_paid_coin: number | string | null;
  fees_paid_quote: number | string | null;
}): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let launchId = row.maelstrom_launch_id;
  if (!launchId && row.pool_object_id) {
    launchId = await findMaelstromLaunchId(row.pool_object_id);
    if (launchId) {
      await supabaseAdmin.from("x_launch_requests").update({ maelstrom_launch_id: launchId }).eq("pool_object_id", row.pool_object_id);
    }
  }
  if (!launchId) return `$${row.symbol}: STROM launch record not found`;

  const { feeRouting } = await import("./xLauncher.server");
  const routing = await feeRouting(row.x_username, { handle: row.fee_receiver_x_username, wallet: row.fee_receiver_wallet });
  const paidCoin = BigInt(String(row.fees_paid_coin ?? 0).split(".")[0] || "0");
  const paidQuote = BigInt(String(row.fees_paid_quote ?? 0).split(".")[0] || "0");
  const out = await payMaelstromCreatorFees(launchId, paidCoin, paidQuote, routing.payees, routing.shareBps).catch((e) => ({
    ok: false, message: e instanceof Error ? e.message : "claim failed", digest: null, paidCoin: 0n, paidQuote: 0n, quoteType: null,
  }));
  if (!out.ok || !out.digest) return `$${row.symbol}: ${out.message}`;
  await supabaseAdmin
    .from("x_launch_requests")
    .update({ fees_paid_coin: String(paidCoin + out.paidCoin), fees_paid_quote: String(paidQuote + out.paidQuote) } as never)
    .eq("maelstrom_launch_id", launchId);
  const quoteSym = out.quoteType?.split("::").pop() ?? "";
  return `$${row.symbol}: ${(Number(out.paidQuote) / (quoteSym === "SUI" ? 1e9 : 1e6)).toFixed(4)} ${quoteSym} + ${row.symbol} split 80/10/10 ✅ suiscan.xyz/mainnet/tx/${out.digest}`;
}
