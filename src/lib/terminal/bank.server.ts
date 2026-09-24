import { normalizeStructTag, normalizeSuiAddress } from "@mysten/sui/utils";

import { describeRecipient, parseBankCommand, toAtomic, type BankCommand } from "./bank";
import { X_BOT_SITE } from "./x-bot";

const SUI_TYPE = normalizeStructTag("0x2::sui::SUI");
const bankLink = () => `${X_BOT_SITE}/terminal#ourbank`;

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
async function rpc<T>(method: string, params: unknown[]) {
  const { rpc: call } = await import("./suipump-launch.server");
  return call<T>(method, params);
}

/** Wallet linked in OurBlast by whoever signed in with this X handle. */
async function walletForXHandle(handle: string): Promise<{ userId: string; wallet: string | null } | null> {
  const db = await admin();
  const { data: account } = await db.from("x_accounts").select("user_id").ilike("username", handle).maybeSingle();
  if (!account) return null;
  const { data: profile } = await db.from("profiles").select("wallet_address").eq("id", account.user_id).maybeSingle();
  return { userId: account.user_id, wallet: profile?.wallet_address ?? null };
}

async function resolveSuins(name: string): Promise<string | null> {
  try {
    const addr = await rpc<string | null>("suix_resolveNameServiceAddress", [name]);
    return addr ? normalizeSuiAddress(addr) : null;
  } catch {
    return null;
  }
}

export async function resolveRecipient(kind: string, input: string): Promise<string | null> {
  if (kind === "address") return normalizeSuiAddress(input);
  if (kind === "suins") return resolveSuins(input);
  const linked = await walletForXHandle(input);
  return linked?.wallet ? normalizeSuiAddress(linked.wallet) : null;
}

interface CoinMatch { coinType: string; symbol: string; decimals: number; balance: bigint }

/** Coins in the wallet matching the ticker or coin type the tweet named. */
export async function matchCoins(wallet: string, command: Pick<BankCommand, "token" | "isCoinType">): Promise<CoinMatch[]> {
  const balances = await rpc<{ coinType: string; totalBalance: string }[]>("suix_getAllBalances", [wallet]);
  const out: CoinMatch[] = [];
  for (const b of balances) {
    if (BigInt(b.totalBalance) <= 0n) continue;
    const type = normalizeStructTag(b.coinType);
    if (command.isCoinType && type !== normalizeStructTag(command.token)) continue;
    const meta = await rpc<{ symbol: string; decimals: number } | null>("suix_getCoinMetadata", [b.coinType]).catch(() => null);
    const symbol = (meta?.symbol ?? type.split("::").at(-1) ?? "").toUpperCase();
    if (!command.isCoinType && symbol !== command.token) continue;
    if (!meta && type !== SUI_TYPE) continue;
    out.push({ coinType: type, symbol, decimals: meta?.decimals ?? 9, balance: BigInt(b.totalBalance) });
  }
  return out;
}

/**
 * Turns an "@ourblastbot send …" tweet into a transfer request that only the
 * sender's own wallet can approve. Returns the reply text, or null when the tweet
 * is not a bank command. Nothing is ever sent by the bot itself.
 */
export async function createBankTransferFromMention(postId: string, username: string, text: string): Promise<string | null> {
  const command = parseBankCommand(text);
  if (!command) return null;
  const db = await admin();
  const who = describeRecipient(command.recipientKind, command.recipient);

  // Instant path: the sender has a funded OurBank wallet, so the bot sends now.
  const instant = await tryInstantSend(postId, username, command, who);
  if (instant !== undefined) return instant;

  const sender = await walletForXHandle(username);
  if (!sender?.wallet) {
    return `@${username} to send with OurBank, sign in with X at ${X_BOT_SITE}/terminal and connect your Sui wallet first. Then tweet again.`;
  }
  const senderWallet = normalizeSuiAddress(sender.wallet);

  let coin: CoinMatch | null = null;
  let error: string | null = null;
  try {
    const matches = await matchCoins(senderWallet, command);
    if (matches.length === 0) error = `No ${command.isCoinType ? "coin of that type" : command.token} found in your linked wallet.`;
    else if (matches.length === 1) coin = matches[0]!;
  } catch {
    error = "Could not read your wallet balance right now.";
  }
  if (error) return `@${username} ${error}`;

  let amountAtomic: bigint | null = null;
  if (coin) {
    try {
      amountAtomic = toAtomic(command.amount, coin.decimals);
    } catch (e) {
      return `@${username} ${(e as Error).message}`;
    }
    if (amountAtomic > coin.balance) return `@${username} your linked wallet doesn't hold ${command.amount} ${coin.symbol}.`;
  }

  const recipientAddress = await resolveRecipient(command.recipientKind, command.recipient);
  if (!recipientAddress && command.recipientKind === "suins") return `@${username} ${command.recipient} doesn't point to a Sui address.`;
  if (recipientAddress && recipientAddress === senderWallet) return `@${username} that's your own wallet.`;

  const status = recipientAddress ? "PENDING_APPROVAL" : "WAITING_RECIPIENT";
  const { error: insertError } = await db.from("bank_transfers").insert({
    x_post_id: postId,
    sender_user_id: sender.userId,
    sender_x_username: username,
    sender_wallet: senderWallet,
    recipient_kind: command.recipientKind,
    recipient_input: command.recipient,
    recipient_address: recipientAddress,
    coin_type: coin?.coinType ?? null,
    symbol: coin?.symbol ?? command.token.split("::").at(-1)!.toUpperCase(),
    decimals: coin?.decimals ?? null,
    // Sent as a string so big integers keep full precision in the numeric column.
    amount_atomic: (amountAtomic !== null ? amountAtomic.toString() : null) as unknown as number | null,
    amount_display: Number(command.amount),
  });
  // One tweet = one transfer: a duplicate means we already answered it.
  if (insertError?.code === "23505") return null;
  if (insertError) throw new Error(insertError.message);

  const label = coin?.symbol ?? command.token.split("::").at(-1)!;
  if (status === "WAITING_RECIPIENT") {
    return `@${username} transfer saved: ${command.amount} ${label} → ${who}. ${who} must sign in with X at ${X_BOT_SITE} and connect a wallet first; then approve it at ${bankLink()}`;
  }
  return `@${username} transfer ready: ${command.amount} ${label} → ${who}. Approve it with your wallet at ${bankLink()} — nothing moves until you do.`;
}

/**
 * Checks the chain: the digest must come from the sender's wallet and pay the
 * recipient exactly this amount of this coin. Only then is it CONFIRMED.
 */
export async function verifyTransferOnChain(row: {
  sender_wallet: string; recipient_address: string; coin_type: string; amount_atomic: string;
}, digest: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  let tx: {
    transaction?: { data?: { sender?: string } };
    effects?: { status?: { status?: string; error?: string } };
    balanceChanges?: { owner: { AddressOwner?: string }; coinType: string; amount: string }[];
  };
  try {
    tx = await rpc("sui_getTransactionBlock", [digest, { showInput: true, showEffects: true, showBalanceChanges: true }]);
  } catch {
    return { ok: false, reason: "Transaction not found on the network yet." };
  }
  if (tx.effects?.status?.status !== "success") return { ok: false, reason: tx.effects?.status?.error ?? "Transaction failed on chain." };
  if (normalizeSuiAddress(tx.transaction?.data?.sender ?? "0x0") !== row.sender_wallet) {
    return { ok: false, reason: "Transaction was not sent from your linked wallet." };
  }
  const received = (tx.balanceChanges ?? []).find(
    (c) =>
      c.owner.AddressOwner &&
      normalizeSuiAddress(c.owner.AddressOwner) === row.recipient_address &&
      normalizeStructTag(c.coinType) === row.coin_type,
  );
  if (!received || BigInt(received.amount) !== BigInt(row.amount_atomic)) {
    return { ok: false, reason: "Transaction doesn't pay the recipient the requested amount." };
  }
  return { ok: true };
}

/** Housekeeping on every poll: expire stale requests and fill in recipients who have since linked a wallet. */
export async function maintainBankTransfers() {
  const db = await admin();
  await db
    .from("bank_transfers")
    .update({ status: "EXPIRED" })
    .in("status", ["PENDING_APPROVAL", "WAITING_RECIPIENT"])
    .lt("expires_at", new Date().toISOString());
  const { data: waiting } = await db
    .from("bank_transfers")
    .select("id, recipient_kind, recipient_input")
    .eq("status", "WAITING_RECIPIENT")
    .limit(20);
  for (const row of waiting ?? []) {
    const address = await resolveRecipient(row.recipient_kind, row.recipient_input).catch(() => null);
    if (address) {
      await db.from("bank_transfers").update({ recipient_address: address, status: "PENDING_APPROVAL" }).eq("id", row.id);
    }
  }
}

/**
 * Bankrbot-style send from the sender's bot-held OurBank wallet. Returns the
 * reply, null for a duplicate tweet, or undefined to fall back to the
 * approve-in-terminal flow (no OurBank wallet, or not enough of that coin).
 */
async function tryInstantSend(postId: string, username: string, command: BankCommand, who: string): Promise<string | null | undefined> {
  const { findBankWallet, ensureBankWallet, sendFromBankWallet, SUI_TYPE: SUI, GAS_BUDGET } = await import("./bank-wallet.server");
  const wallet = await findBankWallet(username);
  if (!wallet) return undefined;

  let matches: CoinMatch[];
  try {
    matches = await matchCoins(wallet.address, command);
  } catch {
    return `@${username} couldn't read your OurBank wallet right now. Try again in a minute.`;
  }
  if (matches.length !== 1) return undefined;
  const coin = matches[0]!;
  let amount: bigint;
  try {
    amount = toAtomic(command.amount, coin.decimals);
  } catch (e) {
    return `@${username} ${(e as Error).message}`;
  }
  const needed = coin.coinType === SUI ? amount + GAS_BUDGET : amount;
  if (needed > coin.balance) return undefined;

  let recipient = await resolveRecipient(command.recipientKind, command.recipient);
  // X users without a linked wallet get an OurBank wallet they can use by signing in.
  if (!recipient && command.recipientKind === "x") recipient = (await ensureBankWallet(command.recipient, null)).address;
  if (!recipient) return `@${username} ${command.recipient} doesn't point to a Sui address.`;
  if (recipient === normalizeSuiAddress(wallet.address)) return `@${username} that's your own wallet.`;

  const db = await admin();
  const senderUserId = wallet.user_id ?? (await walletForXHandle(username))?.userId;
  if (!senderUserId) return undefined;
  // Claim the tweet first: one tweet can never send twice.
  const { data: row, error } = await db
    .from("bank_transfers")
    .insert({
      x_post_id: postId,
      sender_user_id: senderUserId,
      sender_x_username: username,
      sender_wallet: normalizeSuiAddress(wallet.address),
      recipient_kind: command.recipientKind,
      recipient_input: command.recipient,
      recipient_address: recipient,
      coin_type: coin.coinType,
      symbol: coin.symbol,
      decimals: coin.decimals,
      amount_atomic: amount.toString() as unknown as number,
      amount_display: Number(command.amount),
      status: "SUBMITTED",
      instant: true,
    })
    .select("id")
    .single();
  if (error?.code === "23505") return null;
  if (error || !row) throw new Error(error?.message ?? "Could not save transfer.");

  const sent = await sendFromBankWallet(wallet, coin.coinType, amount, recipient);
  if (!sent.ok) {
    await db.from("bank_transfers").update({ status: "FAILED", error: sent.error }).eq("id", row.id);
    return `@${username} transfer failed: ${sent.error.slice(0, 120)}`;
  }
  await db.from("bank_transfers").update({ status: "CONFIRMED", tx_digest: sent.digest }).eq("id", row.id);
  return `@${username} sent ${command.amount} ${coin.symbol} to ${who} ✅ https://suiscan.xyz/mainnet/tx/${sent.digest}`;
}
