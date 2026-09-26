import { normalizeStructTag, normalizeSuiAddress } from "@mysten/sui/utils";

import { describeRecipient, isBurnAddress, parseBankCommand, parseChoiceReply, parseSwapCommand, shortCoinType, toAtomic, type BankCommand } from "./bank";
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

/** Which wallet this X user chose for sends, buys and sells: their OurBank wallet (default) or their own. */
export async function tradeWalletFor(handle: string): Promise<"ourbank" | "own"> {
  const db = await admin();
  const { data: account } = await db.from("x_accounts").select("user_id").ilike("username", handle).maybeSingle();
  if (!account) return "ourbank";
  const { data } = await db.from("bank_preferences").select("trade_wallet").eq("user_id", account.user_id).maybeSingle();
  return data?.trade_wallet === "own" ? "own" : "ourbank";
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
export async function createBankTransferFromMention(
  postId: string,
  username: string,
  text: string,
  chosenCoinType?: string,
): Promise<string | null> {
  const parsed = parseBankCommand(text);
  const command = parsed && chosenCoinType ? { ...parsed, token: chosenCoinType, isCoinType: true } : parsed;
  if (!command) return null;
  const db = await admin();
  const who = describeRecipient(command.recipientKind, command.recipient);

  // Instant path: the sender has a funded OurBank wallet, so the bot sends now.
  // Skipped when the user chose to approve everything with their own wallet.
  if ((await tradeWalletFor(username)) === "ourbank") {
    const instant = await tryInstantSend(postId, username, command, who, text);
    if (instant !== undefined) return instant;
  }

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
async function tryInstantSend(postId: string, username: string, command: BankCommand, who: string, text: string): Promise<string | null | undefined> {
  const { findBankWallet, ensureBankWallet, sendFromBankWallet, SUI_TYPE: SUI, GAS_BUDGET } = await import("./bank-wallet.server");
  const wallet = await findBankWallet(username);
  if (!wallet) return undefined;

  let matches: CoinMatch[];
  try {
    matches = await matchCoins(wallet.address, command);
  } catch {
    return `@${username} couldn't read your OurBank wallet right now. Try again in a minute.`;
  }
  if (matches.length > 1) return askWhichCoin(postId, username, text, matches);
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

/**
 * Several coins in the OurBank wallet share this ticker: save the options and
 * ask which contract address the user meant. They answer by replying "1", "2"…
 */
async function askWhichCoin(postId: string, username: string, text: string, matches: CoinMatch[]): Promise<string | null> {
  const db = await admin();
  const options = matches.slice(0, 4);
  const { error } = await db.from("bank_choices").insert({
    x_username: username.toLowerCase(),
    x_post_id: postId,
    command_text: text,
    options: options.map((m) => m.coinType),
  });
  if (error?.code === "23505") return null;
  if (error) throw new Error(error.message);
  const list = options.map((m, i) => `${i + 1}) ${shortCoinType(m.coinType)}`).join("\n");
  return `@${username} you hold ${options.length} tokens called ${options[0]!.symbol}. Which one? Reply with the number:\n${list}`;
}

/** A reply that answers the bot's "which token?" question, if one is waiting. */
async function resolvePendingChoice(postId: string, username: string, text: string): Promise<string | null> {
  const db = await admin();
  const { data: pending } = await db
    .from("bank_choices")
    .select("id, x_post_id, command_text, options")
    .eq("x_username", username.toLowerCase())
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pending || pending.x_post_id === postId) return null;
  const options = (pending.options as string[]) ?? [];
  const chosen = parseChoiceReply(text, options);
  if (!chosen) return null;
  // Delete first: only one reply can ever act on this question.
  const { data: taken } = await db.from("bank_choices").delete().eq("id", pending.id).select("id");
  if (!taken?.length) return null;
  if (parseSwapCommand(pending.command_text)) return handleSwapMention(postId, username, pending.command_text, chosen);
  return createBankTransferFromMention(postId, username, pending.command_text, chosen);
}

/** Buy / sell inside the OurBank wallet via the Aftermath aggregator. */
async function handleSwapMention(postId: string, username: string, text: string, chosenCoinType?: string): Promise<string | null> {
  const parsed = parseSwapCommand(text);
  if (!parsed) return null;
  const command = chosenCoinType ? { ...parsed, token: chosenCoinType, isCoinType: true } : parsed;
  const { findBankWallet } = await import("./bank-wallet.server");
  const { executeBankSwap, swapAmountIn, formatUnits, SWAP_SUI, SWAP_GAS_BUDGET } = await import("./bank-swap.server");

  if (command.side === "buy" && !command.isCoinType) {
    return `@${username} to buy safely, paste the token's full contract address, e.g. buy 5 SUI of 0x…::coin::COIN`;
  }
  const mode = await tradeWalletFor(username);
  type BankWalletRow = NonNullable<Awaited<ReturnType<typeof findBankWallet>>>;
  let wallet: BankWalletRow | null;
  let ownerUserId: string | null = null;
  if (mode === "own") {
    // Own wallet: the bot only prepares the trade; the user signs it in the terminal.
    if (command.sendTo) return `@${username} "buy and send" only works with your OurBank wallet. Switch it in the terminal, or send separately after the trade.`;
    const linked = await walletForXHandle(username);
    if (!linked?.wallet) return `@${username} connect your Sui wallet at ${X_BOT_SITE}/terminal first, then tweet again.`;
    wallet = { address: normalizeSuiAddress(linked.wallet), secret_ciphertext: null, signing_backend: "local", turnkey_key_id: null, turnkey_public_key: null, x_username: username.toLowerCase(), user_id: linked.userId };
    ownerUserId = linked.userId;
  } else {
    wallet = await findBankWallet(username);
    if (!wallet) return `@${username} you don't have an OurBank wallet yet. Sign in with X at ${X_BOT_SITE}/terminal to get one, fund it, then tweet again.`;
  }
  const walletLabel = mode === "own" ? "wallet" : "OurBank wallet";

  let coinIn: string, coinOut: string, decimalsIn: number, balanceIn: bigint, symbolOut: string, decimalsOut: number, symbolIn: string;
  try {
    const suiMatch = (await matchCoins(wallet.address, { token: SWAP_SUI, isCoinType: true }))[0];
    if (command.side === "buy") {
      coinIn = SWAP_SUI; symbolIn = "SUI"; decimalsIn = 9; balanceIn = suiMatch?.balance ?? 0n;
      coinOut = normalizeStructTag(command.token);
      const meta = await rpc<{ symbol: string; decimals: number } | null>("suix_getCoinMetadata", [coinOut]).catch(() => null);
      if (!meta) return `@${username} couldn't find that token on Sui. Check the contract address.`;
      symbolOut = meta.symbol.toUpperCase(); decimalsOut = meta.decimals;
    } else {
      const matches = await matchCoins(wallet.address, command);
      if (matches.length === 0) return `@${username} no ${command.isCoinType ? "coin of that type" : command.token} in your ${walletLabel}.`;
      if (matches.length > 1) return askWhichCoin(postId, username, text, matches);
      const coin = matches[0]!;
      coinIn = coin.coinType; symbolIn = coin.symbol; decimalsIn = coin.decimals; balanceIn = coin.balance;
      coinOut = SWAP_SUI; symbolOut = "SUI"; decimalsOut = 9;
      if ((suiMatch?.balance ?? 0n) < SWAP_GAS_BUDGET) return `@${username} add a little SUI (0.05) to your ${walletLabel} for network fees first.`;
    }
  } catch {
    return `@${username} couldn't read your ${walletLabel} right now. Try again in a minute.`;
  }

  let amountIn: bigint;
  try {
    amountIn = swapAmountIn(command, decimalsIn, balanceIn);
  } catch (e) {
    return `@${username} ${(e as Error).message}`;
  }
  const needed = command.side === "buy" ? amountIn + SWAP_GAS_BUDGET : amountIn;
  if (amountIn <= 0n) return `@${username} that amount is too small.`;
  if (needed > balanceIn) {
    return `@${username} your ${walletLabel} doesn't hold enough ${symbolIn}${command.side === "buy" ? " (plus 0.05 SUI for fees)" : ""}.`;
  }

  const db = await admin();
  const { data: row, error } = await db
    .from("bank_swaps")
    .insert({
      x_post_id: postId, x_username: username.toLowerCase(), wallet: normalizeSuiAddress(wallet.address),
      side: command.side, coin_in: coinIn, coin_out: coinOut, amount_in: amountIn.toString(),
      ...(mode === "own" ? { status: "PENDING_APPROVAL", source: "own", user_id: ownerUserId } : {}),
    })
    .select("id")
    .single();
  // Another run already owns this trade — stay silent (never a generic reply).
  if (error?.code === "23505") return "";
  if (error || !row) throw new Error(error?.message ?? "Could not save swap.");
  if (mode === "own") {
    const what = command.side === "buy" ? `buy with ${formatUnits(amountIn, 9)} SUI` : `sell ${formatUnits(amountIn, decimalsIn)} ${symbolIn}`;
    return `@${username} trade ready: ${what}. Approve it with your wallet at ${bankLink()} — nothing moves until you do.`;
  }

  let result: Awaited<ReturnType<typeof executeBankSwap>>;
  try {
    result = await executeBankSwap(wallet, coinIn, coinOut, amountIn);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Trade service failed.";
    await db.from("bank_swaps").update({ status: "FAILED", error: message.slice(0, 500) }).eq("id", row.id);
    return `@${username} swap not done: the trade service failed before submission. Nothing was spent — try again.`;
  }
  if (!result.ok) {
    await db.from("bank_swaps").update({ status: "FAILED", error: result.error }).eq("id", row.id);
    return `@${username} swap not done: ${result.error.slice(0, 140)}`;
  }
  await db.from("bank_swaps").update({ status: "CONFIRMED", tx_digest: result.digest, quoted_out: result.quoted.toString() }).eq("id", row.id);
  const got = formatUnits(result.received ?? result.quoted, decimalsOut);
  const verb = command.side === "buy" ? "bought" : "sold";
  const detail = command.side === "buy"
    ? `${got} ${symbolOut} for ${formatUnits(amountIn, 9)} SUI`
    : `${formatUnits(amountIn, decimalsIn)} ${symbolIn} for ${got} SUI`;
  const done = `@${username} ${verb} ${detail} via ${result.venue} ✅ https://suiscan.xyz/mainnet/tx/${result.digest}`;
  if (!command.sendTo) return done;

  // Second step: forward tokens, only after the swap confirmed. Either the whole
  // amount received ("send it to …") or an explicit amount ("send 1000 BLAST to …").
  const who = describeRecipient(command.sendTo.recipientKind, command.sendTo.recipient);
  const received = result.received;
  if (!received || received <= 0n) return `${done} — couldn't confirm the amount received, so nothing was sent to ${who}.`;
  let sendAmount = received;
  if (command.sendTo.amount) {
    const want = (command.sendTo.token ?? "").replace(/^\$/, "");
    const matches = want.includes("::") ? want.toLowerCase() === coinOut.toLowerCase() : want.toUpperCase() === symbolOut.toUpperCase();
    if (!matches) return `${done} — you asked to send ${want}, but the trade delivered ${symbolOut}. Nothing was sent.`;
    try {
      sendAmount = toAtomic(command.sendTo.amount, decimalsOut);
    } catch {
      return `${done} — couldn't read the amount to send to ${who}.`;
    }
    if (sendAmount <= 0n || sendAmount > received) {
      return `${done} — you only received ${got} ${symbolOut}, so ${command.sendTo.amount} ${symbolOut} couldn't be sent to ${who}.`;
    }
  }
  const { ensureBankWallet, sendFromBankWallet } = await import("./bank-wallet.server");
  let to = await resolveRecipient(command.sendTo.recipientKind, command.sendTo.recipient);
  if (!to && command.sendTo.recipientKind === "x") to = (await ensureBankWallet(command.sendTo.recipient, null)).address;
  if (!to) return `${done} — ${who} doesn't point to a Sui address, so the tokens stay in your wallet.`;
  if (to === normalizeSuiAddress(wallet.address)) return done;
  const sent = await sendFromBankWallet(wallet, coinOut, sendAmount, to);
  if (!sent.ok) return `${done} — sending to ${who} failed, tokens stay in your wallet.`;
  await db.from("bank_swaps").update({ error: `forwarded to ${who}: ${sent.digest}` }).eq("id", row.id);
  const tag = command.side === "buy" ? symbolOut : "SUI";
  const sentAmount = command.sendTo.amount ? `${formatUnits(sendAmount, decimalsOut)} ${tag}` : "it";
  const burned = isBurnAddress(command.sendTo.recipientKind, command.sendTo.recipient);
  const tail = burned ? `and burned ${sentAmount} 🔥` : `and sent ${sentAmount} to ${who}`;
  return `@${username} ${verb} ${got} ${tag} via ${result.venue} ${tail} ✅ https://suiscan.xyz/mainnet/tx/${sent.digest}`;
}

/** Single entry for OurBank tweets: token choice replies, swaps, then transfers. */
const TRADE_WORDS = /\b(?:buy|bought|sell|sold|swap|burn|trade)\b/i;

export async function handleBankMention(postId: string, username: string, text: string): Promise<string | null> {
  const choice = await resolvePendingChoice(postId, username, text);
  if (choice !== null) return choice;
  if (parseSwapCommand(text)) return handleSwapMention(postId, username, text);
  const transfer = await createBankTransferFromMention(postId, username, text);
  if (transfer !== null) return transfer;
  // A trade we couldn't read must never fall through to the generic "connect your
  // wallet" agent reply — that wrongly suggests the user is signed out.
  if (TRADE_WORDS.test(text)) {
    return `@${username} I couldn't read that trade. Try: buy 0.2 sui of 0x…::coin::COIN · sell 50% 0x…::coin::COIN · buy and burn 1 sui of $BLAST`;
  }
  return null;
}

/**
 * Staff "Run now" for a buy/sell tweet that got stuck or failed. Only runs when
 * the tweet has no confirmed trade; the old unfinished record is cleared so the
 * normal one-trade-per-tweet guard applies again. Posts the reply on X.
 */
export async function runSwapFromTweet(postId: string): Promise<{ reply: string; posted: boolean; postError: string | null }> {
  const db = await admin();
  const { data: mention } = await db.from("x_mentions").select("x_username, text").eq("x_post_id", postId).maybeSingle();
  if (!mention) throw new Error("Tweet not found.");
  if (!parseSwapCommand(mention.text)) throw new Error("That tweet isn't a buy or sell.");
  const { data: swap } = await db.from("bank_swaps").select("id, status, tx_digest").eq("x_post_id", postId).maybeSingle();
  if (swap?.status === "CONFIRMED" || swap?.tx_digest) throw new Error("This trade already went through.");
  if (swap) await db.from("bank_swaps").delete().eq("id", swap.id);

  const reply = (await handleSwapMention(postId, mention.x_username, mention.text)) ?? "";
  if (!reply) throw new Error("Nothing to run for this tweet.");
  const { readXCredentials, postReply, friendlyXError } = await import("./x-api.server");
  const credentials = readXCredentials();
  let replyPostId: string | null = null;
  let postError: string | null = null;
  if (credentials) {
    try { replyPostId = await postReply(credentials, postId, reply); } catch (e) { postError = friendlyXError(e); }
  }
  await db.from("x_mentions").update({
    intent: "bankSwap", status: "READY", reply_text: reply, posted: Boolean(replyPostId),
    reply_post_id: replyPostId, post_error: postError, posted_at: replyPostId ? new Date().toISOString() : null,
  }).eq("x_post_id", postId);
  return { reply, posted: Boolean(replyPostId), postError };
}

/** Recent buy/sell tweets with their trade state, for the staff panel. */
export async function listSwapTweets() {
  const db = await admin();
  const { data: mentions } = await db.from("x_mentions")
    .select("x_post_id, x_username, text, reply_text, posted, created_at")
    .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString())
    .order("created_at", { ascending: false }).limit(200);
  const swaps = (mentions ?? []).filter((m) => parseSwapCommand(m.text)).slice(0, 30);
  const { data: rows } = await db.from("bank_swaps").select("x_post_id, status, tx_digest, error")
    .in("x_post_id", swaps.map((m) => m.x_post_id).concat(["-"]));
  const byId = new Map((rows ?? []).map((r) => [r.x_post_id, r]));
  return swaps.map((m) => ({ ...m, swap: byId.get(m.x_post_id) ?? null }));
}
