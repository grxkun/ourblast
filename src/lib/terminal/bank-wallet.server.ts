// SPDX-License-Identifier: BUSL-1.1
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeStructTag, normalizeSuiAddress } from "@mysten/sui/utils";

import { decryptConnectionKey, encryptConnectionKey } from "@/lib/connection-key.server";
import { readAddressBalance, readSuiHoldings } from "./sui-balances.server";

/**
 * OurBank wallets: one bot-held Sui wallet per X account, like Bankrbot. New
 * wallets are created inside Turnkey's hardware enclaves when Turnkey is
 * configured — the key never exists in our database. Older wallets keep their
 * AES-encrypted local key. Either way only the address ever leaves the server.
 */
const SUI_TYPE = normalizeStructTag("0x2::sui::SUI");
const GAS_BUDGET = 10_000_000n; // 0.01 SUI

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
async function chain() {
  return import("./suipump-launch.server");
}
async function turnkey() {
  return import("./turnkey.server");
}

export type SigningBackend = "local" | "turnkey";

export interface BankWallet {
  address: string;
  x_username: string;
  user_id: string | null;
  signingBackend: SigningBackend;
}

interface BankWalletRow {
  address: string;
  x_username: string;
  user_id: string | null;
  secret_ciphertext: string | null;
  signing_backend: string;
  turnkey_key_id: string | null;
  turnkey_public_key: string | null;
}

const WALLET_COLUMNS = "address, x_username, user_id, secret_ciphertext, signing_backend, turnkey_key_id, turnkey_public_key";

function toWallet(row: BankWalletRow): BankWallet {
  return {
    address: row.address,
    x_username: row.x_username,
    user_id: row.user_id,
    signingBackend: row.signing_backend === "turnkey" ? "turnkey" : "local",
  };
}

/**
 * Replaces the wallet for an X handle with a user-supplied key (import) or a
 * freshly generated one (reset). The old wallet must be empty first — funds
 * in a wallet whose key we discard are lost forever. Returns the new wallet.
 */
export async function replaceBankWalletKey(
  handle: string,
  userId: string | null,
  secretKey: string | null,
): Promise<BankWallet> {
  const existing = await findBankWallet(handle);
  if (existing) {
    const balances = await bankBalances(existing.address).catch(() => []);
    if (balances.length > 0) {
      throw new Error("Withdraw all funds from your current OurBank wallet first — replacing the key would lose them.");
    }
  }

  const tk = await turnkey();
  let row: Omit<BankWalletRow, "x_username" | "user_id">;
  if (tk.turnkeyConfigured()) {
    const name = `ourbank-${handle.toLowerCase()}-${Date.now()}`;
    const account = secretKey
      ? await tk.importSuiPrivateKey(name, normalizeSecretKey(secretKey))
      : await tk.createSuiWallet(name);
    if (secretKey) {
      // The imported wallet must be the exact wallet the user backed up.
      const expected = normalizeSuiAddress(Ed25519Keypair.fromSecretKey(secretKey.trim()).getPublicKey().toSuiAddress());
      if (normalizeSuiAddress(account.address) !== expected) {
        throw new Error("Import failed: the secured wallet address did not match your key. Nothing was changed.");
      }
    }
    row = {
      address: account.address,
      secret_ciphertext: null,
      signing_backend: "turnkey",
      turnkey_key_id: account.walletId,
      turnkey_public_key: account.publicKey,
    };
  } else {
    const keypair = secretKey ? Ed25519Keypair.fromSecretKey(secretKey.trim()) : Ed25519Keypair.generate();
    row = {
      address: keypair.getPublicKey().toSuiAddress(),
      secret_ciphertext: encryptConnectionKey(keypair.getSecretKey()),
      signing_backend: "local",
      turnkey_key_id: null,
      turnkey_public_key: null,
    };
  }

  const db = await admin();
  if (existing) {
    const { error } = await db
      .from("bank_wallets")
      .update({ ...row, user_id: userId ?? existing.user_id })
      .eq("x_username", handle.toLowerCase());
    if (error?.code === "23505") throw new Error("That wallet address is already linked to another account.");
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db
      .from("bank_wallets")
      .insert({ x_username: handle.toLowerCase(), user_id: userId, ...row });
    if (error?.code === "23505") throw new Error("That wallet address is already linked to another account.");
    if (error) throw new Error(error.message);
  }
  return { address: row.address, x_username: handle.toLowerCase(), user_id: userId ?? existing?.user_id ?? null, signingBackend: row.signing_backend as SigningBackend };
}

/** Accepts suiprivkey1… bech32 or raw hex; returns the 32-byte hex Turnkey expects. */
function normalizeSecretKey(secretKey: string): string {
  // getSecretKey() is bech32 ("suiprivkey1…"), never hex — decode it properly.
  const { secretKey: raw } = decodeSuiPrivateKey(Ed25519Keypair.fromSecretKey(secretKey.trim()).getSecretKey());
  return Buffer.from(raw).subarray(0, 32).toString("hex");
}

export async function findBankWallet(handle: string): Promise<BankWalletRow | null> {
  const db = await admin();
  const { data } = await db
    .from("bank_wallets")
    .select(WALLET_COLUMNS)
    .eq("x_username", handle.toLowerCase())
    .maybeSingle();
  return (data as BankWalletRow | null) ?? null;
}

/** Wallet linked to a signed-in account, used by terminal-side flows. */
export async function findBankWalletByUserId(userId: string): Promise<BankWalletRow | null> {
  const db = await admin();
  const { data } = await db
    .from("bank_wallets")
    .select(WALLET_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as BankWalletRow | null) ?? null;
}

/** Existing wallet for this X handle, or a freshly generated one. */
/**
 * When a MetaMask/Rabby account links X, its `evm-<addr>` wallet is re-keyed to
 * the X handle. Skipped if that handle already has its own wallet (never merge
 * or overwrite funds) — returns what happened.
 */
export async function linkEvmWalletToX(userId: string, xUsername: string): Promise<"moved" | "kept" | "none"> {
  const db = await admin();
  const { data: profile } = await db.from("profiles").select("auth_provider, social_id").eq("id", userId).maybeSingle();
  if (profile?.auth_provider !== "evm" || !profile.social_id) return "none";
  const evmHandle = `evm-${profile.social_id.toLowerCase()}`;
  const evmWallet = await findBankWallet(evmHandle);
  if (!evmWallet) return "none";
  if (await findBankWallet(xUsername)) return "kept";
  const { error } = await db
    .from("bank_wallets")
    .update({ x_username: xUsername.toLowerCase(), user_id: userId })
    .eq("x_username", evmHandle);
  if (error) throw new Error(error.message);
  return "moved";
}

export async function ensureBankWallet(handle: string, userId: string | null): Promise<BankWallet> {
  const existing = await findBankWallet(handle);
  if (existing) {
    // Keep user_id in sync with whoever currently owns this X handle, so
    // user_id-based lookups (balances, SOL/EVM bridge) find the same wallet.
    if (userId && existing.user_id !== userId) {
      const db = await admin();
      const { error } = await db.from("bank_wallets").update({ user_id: userId }).eq("x_username", handle.toLowerCase());
      if (!error) return { ...toWallet(existing), user_id: userId };
    }
    return { ...toWallet(existing), user_id: existing.user_id ?? userId };
  }

  const tk = await turnkey();
  let row: Omit<BankWalletRow, "x_username" | "user_id">;
  if (tk.turnkeyConfigured()) {
    try {
      const account = await tk.createSuiWallet(`ourbank-${handle.toLowerCase()}`);
      row = {
        address: account.address,
        secret_ciphertext: null,
        signing_backend: "turnkey",
        turnkey_key_id: account.walletId,
        turnkey_public_key: account.publicKey,
      };
    } catch {
      // Turnkey outage must not block wallet creation — fall back to a local key.
      const keypair = Ed25519Keypair.generate();
      row = {
        address: keypair.getPublicKey().toSuiAddress(),
        secret_ciphertext: encryptConnectionKey(keypair.getSecretKey()),
        signing_backend: "local",
        turnkey_key_id: null,
        turnkey_public_key: null,
      };
    }
  } else {
    const keypair = Ed25519Keypair.generate();
    row = {
      address: keypair.getPublicKey().toSuiAddress(),
      secret_ciphertext: encryptConnectionKey(keypair.getSecretKey()),
      signing_backend: "local",
      turnkey_key_id: null,
      turnkey_public_key: null,
    };
  }

  const db = await admin();
  const { error } = await db.from("bank_wallets").insert({ x_username: handle.toLowerCase(), user_id: userId, ...row });
  if (error?.code === "23505") return ensureBankWallet(handle, userId); // created concurrently
  if (error) throw new Error(error.message);
  return { address: row.address, x_username: handle.toLowerCase(), user_id: userId, signingBackend: row.signing_backend as SigningBackend };
}

export async function bankBalances(address: string) {
  // GraphQL metadata (symbol/decimals) rides along so callers never fall back
  // to the deprecated JSON-RPC metadata endpoint and mis-scale amounts.
  return readSuiHoldings(address);
}

/** A signer for a bank wallet, wherever its key lives. */
export async function bankSigner(wallet: BankWalletRow) {
  if (wallet.signing_backend === "turnkey") {
    const tk = await turnkey();
    if (!tk.turnkeyConfigured()) throw new Error("Turnkey is not configured.");
    const signWith = wallet.turnkey_key_id ?? wallet.address;
    const publicKey = wallet.turnkey_public_key;
    if (!publicKey) throw new Error("Turnkey wallet is missing its public key.");
    const address = normalizeSuiAddress(wallet.address);
    return {
      address,
      backend: "turnkey" as const,
      async signTransaction(bytes: Uint8Array) {
        return { signature: await tk.signSuiTransaction(signWith, publicKey, bytes) };
      },
    };
  }
  if (!wallet.secret_ciphertext) throw new Error("Bank wallet has no signing key.");
  const keypair = Ed25519Keypair.fromSecretKey(decryptConnectionKey(wallet.secret_ciphertext));
  const address = keypair.getPublicKey().toSuiAddress();
  if (address !== normalizeSuiAddress(wallet.address)) throw new Error("Bank wallet key mismatch.");
  return { address, backend: "local" as const, signTransaction: (bytes: Uint8Array) => keypair.signTransaction(bytes) };
}

type Result = { ok: true; digest: string } | { ok: false; error: string };

type CoinRef = { coinObjectId: string; version: string; digest: string; balance: string };
type TxCoin = ReturnType<Transaction["splitCoins"]>[number];
export interface TokenSourceDeps {
  getCoins: (owner: string, coinType: string) => Promise<CoinRef[]>;
  addressBalance: (owner: string, coinType: string) => Promise<bigint>;
}

/**
 * Finds spendable funds for a token: Coin objects first, then the address
 * accumulator. Funds received via balance::send_funds have no Coin object yet,
 * so they are withdrawn and redeemed into one inside the same transaction.
 */
export async function tokenSendSource(
  tx: Transaction,
  sender: string,
  type: string,
  amount: bigint | null,
  deps: TokenSourceDeps,
): Promise<{ coin: TxCoin } | { error: string }> {
  const label = type.split("::").at(-1) ?? type;
  const coins = await deps.getCoins(sender, type);
  const coinsTotal = coins.reduce((sum, c) => sum + BigInt(c.balance), 0n);
  let primary: TxCoin | null = null;
  if (coins.length) {
    const refs = coins.map((c) => tx.objectRef({ objectId: c.coinObjectId, version: c.version, digest: c.digest }));
    const [first, ...rest] = refs;
    if (rest.length) tx.mergeCoins(first!, rest);
    primary = first!;
  }
  const topUp = amount === null ? 0n : amount - coinsTotal;
  const acc = amount === null || topUp > 0n ? await deps.addressBalance(sender, type) : 0n;
  if (amount !== null && coinsTotal + acc < amount) return { error: `Not enough ${label} in your OurBank wallet.` };
  if (amount === null && coinsTotal + acc === 0n) return { error: `No ${label} coins in your OurBank wallet.` };
  const withdraw = amount === null ? acc : topUp > 0n ? topUp : 0n;
  let source = primary;
  if (withdraw > 0n) {
    const withdrawal = tx.moveCall({
      target: "0x2::balance::withdraw_funds_from_object",
      typeArguments: [type],
      arguments: [tx.object(sender), tx.pure.u64(withdraw)],
    });
    const balance = tx.moveCall({ target: "0x2::balance::redeem_funds", typeArguments: [type], arguments: [withdrawal] });
    const redeemed = tx.moveCall({ target: "0x2::coin::from_balance", typeArguments: [type], arguments: [balance] });
    if (source) tx.mergeCoins(source, [redeemed]);
    else source = redeemed;
  }
  if (!source) return { error: `No ${label} coins in your OurBank wallet.` };
  return { coin: amount === null ? source : tx.splitCoins(source, [tx.pure.u64(amount)])[0]! };
}

function tokenSourceDeps(rpc: <T>(method: string, params: unknown[]) => Promise<T>): TokenSourceDeps {
  return {
    getCoins: async (owner, coinType) =>
      (await rpc<{ data: CoinRef[] }>("suix_getCoins", [owner, coinType, null, 50])).data ?? [],
    addressBalance: readAddressBalance,
  };
}

/** Sends `amount` of `coinType` (or everything, when amount is null) from a bank wallet. */
export async function sendFromBankWallet(
  wallet: BankWalletRow,
  coinType: string,
  amount: bigint | null,
  recipient: string,
): Promise<Result> {
  const { gasCoins, referenceGasPrice, rpc, withGas, signAndExecute } = await chain();
  let signer: Awaited<ReturnType<typeof bankSigner>>;
  try {
    signer = await bankSigner(wallet);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const sender = signer.address;
  const to = normalizeSuiAddress(recipient);
  const type = normalizeStructTag(coinType);

  const gas = await gasCoins(sender);
  if (gas.length === 0) return { ok: false, error: "Your OurBank wallet has no SUI for network fees." };
  const tx = new Transaction();
  withGas(tx, sender, gas, await referenceGasPrice(), Number(GAS_BUDGET));

  if (type === SUI_TYPE) {
    if (amount === null) tx.transferObjects([tx.gas], tx.pure.address(to));
    else tx.transferObjects([tx.splitCoins(tx.gas, [tx.pure.u64(amount)])[0]!], tx.pure.address(to));
  } else {
    const source = await tokenSendSource(tx, sender, type, amount, tokenSourceDeps(rpc));
    if ("error" in source) return { ok: false, error: source.error };
    tx.transferObjects([source.coin], tx.pure.address(to));
  }

  const executed = await signAndExecute(tx, signer);
  if (!executed.ok || !executed.digest) return { ok: false, error: executed.error ?? "Transaction failed." };
  return { ok: true, digest: executed.digest };
}

/** Sends several coins to one recipient in a single transaction block (all or nothing). */
export async function sendManyFromBankWallet(
  wallet: BankWalletRow,
  items: { coinType: string; amount: bigint }[],
  recipient: string,
): Promise<Result> {
  const { gasCoins, referenceGasPrice, rpc, withGas, signAndExecute } = await chain();
  let signer: Awaited<ReturnType<typeof bankSigner>>;
  try {
    signer = await bankSigner(wallet);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const sender = signer.address;
  const to = normalizeSuiAddress(recipient);
  const gas = await gasCoins(sender);
  if (gas.length === 0) return { ok: false, error: "Your OurBank wallet has no SUI for network fees." };
  const tx = new Transaction();
  withGas(tx, sender, gas, await referenceGasPrice(), Number(GAS_BUDGET));

  const outs: ReturnType<typeof tx.splitCoins>[number][] = [];
  for (const it of items) {
    const type = normalizeStructTag(it.coinType);
    if (type === SUI_TYPE) {
      outs.push(tx.splitCoins(tx.gas, [tx.pure.u64(it.amount)])[0]!);
      continue;
    }
    const page = await rpc<{ data: { coinObjectId: string; version: string; digest: string }[] }>("suix_getCoins", [sender, type, null, 50]);
    const coins = page.data ?? [];
    if (coins.length === 0) return { ok: false, error: `No ${type.split("::").at(-1)} coins in your OurBank wallet.` };
    const refs = coins.map((c) => tx.objectRef({ objectId: c.coinObjectId, version: String(c.version), digest: c.digest }));
    const [primary, ...rest] = refs;
    if (rest.length) tx.mergeCoins(primary!, rest);
    outs.push(tx.splitCoins(primary!, [tx.pure.u64(it.amount)])[0]!);
  }
  tx.transferObjects(outs, tx.pure.address(to));

  const executed = await signAndExecute(tx, signer);
  if (!executed.ok || !executed.digest) return { ok: false, error: executed.error ?? "Transaction failed." };
  return { ok: true, digest: executed.digest };
}

/**
 * Commits SUI to an open Blast.fun presale (blast_presale::commit_open).
 * The caller must have verified the presale object and its package first.
 * Any part a hard cap refuses comes back as a coin and is returned to the wallet.
 */
export async function commitPresaleFromBankWallet(
  wallet: BankWalletRow,
  p: { pkg: string; presaleId: string; memeType: string; amount: bigint },
): Promise<Result> {
  const { gasCoins, referenceGasPrice, withGas, signAndExecute } = await chain();
  let signer: Awaited<ReturnType<typeof bankSigner>>;
  try {
    signer = await bankSigner(wallet);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const sender = signer.address;
  const gas = await gasCoins(sender);
  if (gas.length === 0) return { ok: false, error: "Your OurBank wallet has no SUI for network fees." };
  const tx = new Transaction();
  withGas(tx, sender, gas, await referenceGasPrice(), Number(GAS_BUDGET));
  const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(p.amount)]);
  const [unused] = tx.moveCall({
    target: `${p.pkg}::blast_presale::commit_open`,
    typeArguments: [p.memeType, SUI_TYPE],
    arguments: [tx.object(p.presaleId), payment!, tx.object.clock()],
  });
  tx.transferObjects([unused!], tx.pure.address(sender));
  const executed = await signAndExecute(tx, signer);
  if (!executed.ok || !executed.digest) return { ok: false, error: executed.error ?? "Transaction failed." };
  return { ok: true, digest: executed.digest };
}

export { GAS_BUDGET, SUI_TYPE };
