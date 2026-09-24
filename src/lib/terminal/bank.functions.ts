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
      if (credentials && !row.x_post_id.startsWith("test-")) {
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
  return data?.username ?? null;
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
    return { linked: true as const, address: wallet.address, handle, balances: out };
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
    const { encodeSuiPrivateKey } = await import("@mysten/sui/cryptography");
    const wallet = await findBankWallet(handle);
    if (!wallet) throw new Error("No OurBank wallet yet.");
    const rawKey = decryptConnectionKey(wallet.secret_ciphertext);
    const keyBytes = new Uint8Array(Buffer.from(rawKey, "base64"));
    const suiPrivKey = encodeSuiPrivateKey(keyBytes, "ED25519");
    return { address: wallet.address, secretKey: suiPrivKey };
  });
