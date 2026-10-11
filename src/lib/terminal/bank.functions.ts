// SPDX-License-Identifier: BUSL-1.1
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** The signed-in sender's OurBank requests, newest first. */
export const listMyTransfers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("bank_transfers")
      .select("id, x_post_id, recipient_kind, recipient_input, recipient_address, coin_type, symbol, decimals, amount_atomic, amount_display, status, tx_digest, error, expires_at, created_at")
      .eq("sender_user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({ ...row, amount_atomic: row.amount_atomic === null ? null : String(row.amount_atomic) }));
  });

async function ownRow(userId: string, id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("bank_transfers").select("*").eq("id", id).maybeSingle();
  if (!data || data.sender_user_id !== userId) throw new Error("Transfer not found.");
  return { db: supabaseAdmin, row: data };
}

/** Coins in the sender's wallet matching the tweet — used when a ticker is ambiguous. */
export const transferCoinChoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { row } = await ownRow(context.userId, data.id);
    const { matchCoins } = await import("./bank.server");
    const coins = await matchCoins(row.sender_wallet, { token: row.symbol, isCoinType: false });
    return coins.map((c) => ({ coinType: c.coinType, symbol: c.symbol, decimals: c.decimals, balance: c.balance.toString() }));
  });

/**
 * Locks in exactly what the wallet will sign: coin, amount and recipient.
 * The client builds the transfer from these values; the server re-checks the result.
 */
export const prepareTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), coinType: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, row } = await ownRow(context.userId, data.id);
    if (row.status !== "PENDING_APPROVAL") throw new Error(`This transfer is ${row.status.toLowerCase().replace("_", " ")}.`);
    if (new Date(row.expires_at) < new Date()) throw new Error("This transfer has expired.");
    if (!row.recipient_address) throw new Error("The recipient has not linked a wallet yet.");

    const { data: profile } = await context.supabase.from("profiles").select("wallet_address").eq("id", context.userId).maybeSingle();
    const { normalizeSuiAddress, normalizeStructTag } = await import("@mysten/sui/utils");
    if (!profile?.wallet_address || normalizeSuiAddress(profile.wallet_address) !== row.sender_wallet) {
      throw new Error("Your connected wallet changed since the tweet. Cancel and tweet again.");
    }

    let coinType = row.coin_type;
    let decimals = row.decimals;
    let amountAtomic = row.amount_atomic === null ? null : String(row.amount_atomic);
    if (!coinType) {
      if (!data.coinType) throw new Error("Pick which coin to send.");
      const { matchCoins } = await import("./bank.server");
      const { toAtomic } = await import("./bank");
      const pick = (await matchCoins(row.sender_wallet, { token: row.symbol, isCoinType: false })).find(
        (c) => c.coinType === normalizeStructTag(data.coinType!),
      );
      if (!pick) throw new Error("That coin isn't in your wallet.");
      coinType = pick.coinType;
      decimals = pick.decimals;
      amountAtomic = toAtomic(String(row.amount_display), pick.decimals).toString();
      await db
        .from("bank_transfers")
        .update({ coin_type: coinType, decimals, amount_atomic: amountAtomic as unknown as number })
        .eq("id", row.id);
    }
    return { coinType, decimals, amountAtomic: amountAtomic!, recipient: row.recipient_address };
  });

/** Records the signed digest and marks the transfer CONFIRMED only after the chain agrees. */
export const confirmTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), digest: z.string().min(20).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, row } = await ownRow(context.userId, data.id);
    if (row.status === "CONFIRMED") return { status: "CONFIRMED" as const };
    if (!["PENDING_APPROVAL", "SUBMITTED"].includes(row.status)) throw new Error("This transfer can't be confirmed.");
    if (!row.coin_type || !row.recipient_address || row.amount_atomic === null) throw new Error("Transfer is incomplete.");
    await db.from("bank_transfers").update({ status: "SUBMITTED", tx_digest: data.digest }).eq("id", row.id);

    const { verifyTransferOnChain } = await import("./bank.server");
    let check: Awaited<ReturnType<typeof verifyTransferOnChain>> = { ok: false, reason: "" };
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 1500));
      check = await verifyTransferOnChain(
        { sender_wallet: row.sender_wallet, recipient_address: row.recipient_address, coin_type: row.coin_type, amount_atomic: String(row.amount_atomic) },
        data.digest,
      );
      if (check.ok || !/not found/i.test(check.reason)) break;
    }
    if (!check.ok) {
      // Still indexing: leave it SUBMITTED so the user can re-check.
      if (/not found/i.test(check.reason)) return { status: "SUBMITTED" as const, message: check.reason };
      await db.from("bank_transfers").update({ status: "FAILED", error: check.reason }).eq("id", row.id);
      return { status: "FAILED" as const, message: check.reason };
    }

    // CAS so a double click can't post two "Sent" replies.
    const { data: claimed } = await db
      .from("bank_transfers")
      .update({ status: "CONFIRMED", error: null })
      .eq("id", row.id)
      .neq("status", "CONFIRMED")
      .select("id")
      .maybeSingle();
    if (claimed) {
      const { readXCredentials, postReply } = await import("./x-api.server");
      const { describeRecipient } = await import("./bank");
      const credentials = readXCredentials();
      if (credentials && !row.x_post_id.startsWith("test-") && !row.x_post_id.startsWith("terminal-")) {
        try {
          const replyId = await postReply(
            credentials,
            row.x_post_id,
            `Sent ${row.amount_display} ${row.symbol} to ${describeRecipient(row.recipient_kind as "x", row.recipient_input)} ✅ https://suiscan.xyz/mainnet/tx/${data.digest}`,
          );
          await db.from("bank_transfers").update({ confirmed_reply_post_id: replyId }).eq("id", row.id);
        } catch (error) {
          console.error(`OurBank confirm reply failed: ${error instanceof Error ? error.message : "unknown"}`);
        }
      }
    }
    return { status: "CONFIRMED" as const };
  });

export const cancelTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, row } = await ownRow(context.userId, data.id);
    if (!["PENDING_APPROVAL", "WAITING_RECIPIENT"].includes(row.status)) throw new Error("This transfer can no longer be cancelled.");
    await db.from("bank_transfers").update({ status: "CANCELLED" }).eq("id", row.id);
    return { ok: true };
  });

async function myXHandle(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("x_accounts").select("username").eq("user_id", userId).maybeSingle();
  if (data?.username) return data.username;
  // MetaMask/Rabby-only players use the same synthetic handle as the cross-chain buy.
  const { data: profile } = await supabaseAdmin.from("profiles").select("auth_provider, social_id").eq("id", userId).maybeSingle();
  if (profile?.auth_provider === "evm" && profile.social_id) return `evm-${profile.social_id.toLowerCase()}`;
  return null;
}

/** Your OurBank wallet (created on first visit): the address to top up, plus balances. */
export const getMyBankWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const handle = await myXHandle(context.userId);
    if (!handle) return { linked: false as const };
    const { ensureBankWallet, bankBalances } = await import("./bank-wallet.server");
    const wallet = await ensureBankWallet(handle, context.userId);
    const { rpc } = await import("./suipump-launch.server");
    const balances = await bankBalances(wallet.address).catch(() => []);
    const out = await Promise.all(
      balances.map(async (b) => {
        const meta = await rpc<{ symbol: string; decimals: number } | null>("suix_getCoinMetadata", [b.coinType]).catch(() => null);
        const decimals = meta?.decimals ?? 9;
        return { coinType: b.coinType, symbol: meta?.symbol ?? b.coinType.split("::").at(-1)!, amount: Number(b.balance) / 10 ** decimals };
      }),
    );
    return { linked: true as const, address: wallet.address, handle, balances: out, signingBackend: wallet.signingBackend };
  });

/** Moves everything of one coin from your OurBank wallet to your connected wallet. */
export const withdrawBankWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ coinType: z.string().min(3).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const handle = await myXHandle(context.userId);
    if (!handle) throw new Error("Sign in with X first.");
    const { data: profile } = await context.supabase.from("profiles").select("wallet_address").eq("id", context.userId).maybeSingle();
    if (!profile?.wallet_address) throw new Error("Connect your Sui wallet first.");
    const { findBankWallet, sendFromBankWallet } = await import("./bank-wallet.server");
    const wallet = await findBankWallet(handle);
    if (!wallet) throw new Error("No OurBank wallet yet.");
    const sent = await sendFromBankWallet(wallet, data.coinType, null, profile.wallet_address);
    if (!sent.ok) throw new Error(sent.error);
    return { digest: sent.digest };
  });

/** Import a wallet you already own by pasting its private key. Replaces the generated OurBank wallet (must be empty). */
export const importBankWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ privateKey: z.string().min(10).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const handle = await myXHandle(context.userId);
    if (!handle) throw new Error("Sign in with X first.");
    const { replaceBankWalletKey } = await import("./bank-wallet.server");
    const wallet = await replaceBankWalletKey(handle, context.userId, data.privateKey);
    return { address: wallet.address };
  });

/** Generate a brand-new OurBank wallet, replacing the current one (must be empty). */
export const resetBankWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const handle = await myXHandle(context.userId);
    if (!handle) throw new Error("Sign in with X first.");
    const { replaceBankWalletKey } = await import("./bank-wallet.server");
    const wallet = await replaceBankWalletKey(handle, context.userId, null);
    return { address: wallet.address };
  });

/**
 * Decrypts and returns the private key for the signed-in user's OurBank wallet.
 * This is the real backup — with this key the user has full custody of their funds.
 * The key is shown only to the authenticated wallet owner.
 */
export const exportBankWalletKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const handle = await myXHandle(context.userId);
    if (!handle) throw new Error("Sign in with X first.");
    const { findBankWallet } = await import("./bank-wallet.server");
    const { decryptConnectionKey } = await import("@/lib/connection-key.server");
    const wallet = await findBankWallet(handle);
    if (!wallet) throw new Error("No OurBank wallet yet.");
    if (wallet.signing_backend === "turnkey" || !wallet.secret_ciphertext) {
      throw new Error("This wallet is protected by a secure enclave — its key can't be exported. To use your own key, import a wallet instead.");
    }
    const secretKey = decryptConnectionKey(wallet.secret_ciphertext);
    return { address: wallet.address, secretKey };
  });

/* ---------------- Trade wallet choice + terminal chat commands ---------------- */

/** Which wallet sends, buys and sells use: "ourbank" (instant, bot-held) or "own" (you approve each one). */
export const getTradeWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("bank_preferences").select("trade_wallet").eq("user_id", context.userId).maybeSingle();
    return { tradeWallet: (data?.trade_wallet === "own" ? "own" : "ourbank") as "ourbank" | "own" };
  });

export const setTradeWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ tradeWallet: z.enum(["ourbank", "own"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("bank_preferences")
      .upsert({ user_id: context.userId, trade_wallet: data.tradeWallet }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { tradeWallet: data.tradeWallet };
  });

async function ownSwap(userId: string, id: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: row } = await db.from("bank_swaps").select("*").eq("id", id).eq("user_id", userId).eq("source", "own").maybeSingle();
  if (!row) throw new Error("Trade not found.");
  return { db, row };
}

/** Buy/sell requests waiting for your own wallet's signature. */
export const listMyPendingSwaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data } = await db
      .from("bank_swaps")
      .select("id, x_post_id, side, coin_in, coin_out, amount_in, status, tx_digest, error, created_at")
      .eq("user_id", context.userId)
      .eq("source", "own")
      .order("created_at", { ascending: false })
      .limit(10);
    return data ?? [];
  });

/** Builds a fresh route for your own wallet and returns the unsigned transaction. */
export const prepareOwnSwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { row } = await ownSwap(context.userId, data.id);
    if (row.status !== "PENDING_APPROVAL") throw new Error("This trade is no longer waiting for approval.");
    const { data: profile } = await context.supabase.from("profiles").select("wallet_address").eq("id", context.userId).maybeSingle();
    const { normalizeSuiAddress } = await import("@mysten/sui/utils");
    if (!profile?.wallet_address || normalizeSuiAddress(profile.wallet_address) !== normalizeSuiAddress(row.wallet)) {
      throw new Error("Connect the same wallet this trade was prepared for.");
    }
    const { prepareSwapForAddress } = await import("./bank-swap.server");
    const built = await prepareSwapForAddress(row.wallet, row.coin_in, row.coin_out, BigInt(row.amount_in));
    if (!built.ok) throw new Error(built.error);
    return { bytes: built.bytes, venue: built.venue, quoted: built.quoted.toString(), sender: row.wallet };
  });

/** Records the digest your wallet signed; CONFIRMED only once the chain shows the trade landed. */
export const confirmOwnSwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), digest: z.string().min(20).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, row } = await ownSwap(context.userId, data.id);
    if (row.status === "CONFIRMED") return { status: "CONFIRMED" as const, digest: row.tx_digest };
    if (!["PENDING_APPROVAL", "SUBMITTED"].includes(row.status)) throw new Error("This trade can't be confirmed.");
    await db.from("bank_swaps").update({ status: "SUBMITTED", tx_digest: data.digest }).eq("id", row.id);
    const { normalizeStructTag, normalizeSuiAddress } = await import("@mysten/sui/utils");
    const { rpc } = await import("./suipump-launch.server");
    type Tx = {
      transaction?: { data?: { sender?: string } };
      effects?: { status?: { status?: string; error?: string } };
      balanceChanges?: { owner: { AddressOwner?: string }; coinType: string; amount: string }[];
    };
    let tx: Tx | null = null;
    for (let attempt = 0; attempt < 5 && !tx; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 1500));
      tx = await rpc<Tx>("sui_getTransactionBlock", [data.digest, { showInput: true, showEffects: true, showBalanceChanges: true }]).catch(() => null);
    }
    if (!tx) return { status: "SUBMITTED" as const, message: "Not on the network yet — check again in a moment.", digest: data.digest };
    const fail = async (reason: string) => {
      await db.from("bank_swaps").update({ status: "FAILED", error: reason }).eq("id", row.id);
      return { status: "FAILED" as const, message: reason, digest: data.digest };
    };
    if (tx.effects?.status?.status !== "success") return fail(tx.effects?.status?.error ?? "Transaction failed on chain.");
    const sender = normalizeSuiAddress(row.wallet);
    if (normalizeSuiAddress(tx.transaction?.data?.sender ?? "0x0") !== sender) return fail("Transaction was not sent from your wallet.");
    const got = (tx.balanceChanges ?? []).find(
      (c) => c.owner.AddressOwner && normalizeSuiAddress(c.owner.AddressOwner) === sender && normalizeStructTag(c.coinType) === normalizeStructTag(row.coin_out),
    );
    if (!got || BigInt(got.amount) <= 0n) return fail("The trade didn't deliver the expected coin.");
    const { data: claimed } = await db
      .from("bank_swaps")
      .update({ status: "CONFIRMED", error: null, quoted_out: got.amount })
      .eq("id", row.id)
      .neq("status", "CONFIRMED")
      .select("id")
      .maybeSingle();
    if (claimed && !row.x_post_id.startsWith("terminal-") && !row.x_post_id.startsWith("test-")) {
      const { readXCredentials, postReply } = await import("./x-api.server");
      const credentials = readXCredentials();
      if (credentials) {
        await postReply(credentials, row.x_post_id, `${row.side === "buy" ? "Bought" : "Sold"} ✅ https://suiscan.xyz/mainnet/tx/${data.digest}`).catch((e) =>
          console.error(`own swap reply failed: ${e instanceof Error ? e.message : "unknown"}`),
        );
      }
    }
    return { status: "CONFIRMED" as const, digest: data.digest };
  });

export const cancelOwnSwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, row } = await ownSwap(context.userId, data.id);
    if (row.status !== "PENDING_APPROVAL") throw new Error("This trade can no longer be cancelled.");
    await db.from("bank_swaps").update({ status: "CANCELLED" }).eq("id", row.id);
    return { ok: true };
  });

/**
 * Terminal chat: runs the exact same send / buy / sell logic as an X mention,
 * using the wallet the user picked. Returns the reply plus any request that
 * now waits for the user's own wallet to sign.
 */
export const runBankCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ text: z.string().min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const handle = await myXHandle(context.userId);
    if (!handle) return { reply: "Sign in with X first — sends, buys and sells use the wallet linked to your X account.", swapId: null, transferId: null };
    const { ensureBankWallet } = await import("./bank-wallet.server");
    await ensureBankWallet(handle, context.userId);
    const postId = `terminal-${crypto.randomUUID()}`;
    const { handleFeeCheckMention, handleFeeClaimMention } = await import("./xClaim.server");
    const feeReply = (await handleFeeCheckMention(handle, data.text)) ?? (await handleFeeClaimMention(handle, data.text));
    const { handleBankMention } = await import("./bank.server");
    const raw = feeReply ?? (await handleBankMention(postId, handle, data.text)) ?? "";
    const reply = raw.replace(new RegExp(`^@${handle}\\s+`, "i"), "").trim() ||
      "I couldn't read that. Try: send 1 SUI to @friend · buy 0.5 SUI of 0x…::coin::COIN · sell 50% 0x…::coin::COIN · buy and burn 1 SUI of 0x…::coin::COIN";
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const [{ data: swap }, { data: transfer }] = await Promise.all([
      db.from("bank_swaps").select("id").eq("x_post_id", postId).eq("status", "PENDING_APPROVAL").maybeSingle(),
      db.from("bank_transfers").select("id, coin_type").eq("x_post_id", postId).eq("status", "PENDING_APPROVAL").maybeSingle(),
    ]);
    return { reply, swapId: swap?.id ?? null, transferId: transfer?.coin_type ? transfer.id : null };
  });
