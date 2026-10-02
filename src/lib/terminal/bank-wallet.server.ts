// SPDX-License-Identifier: BUSL-1.1
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeStructTag, normalizeSuiAddress } from "@mysten/sui/utils";

import { decryptConnectionKey, encryptConnectionKey } from "@/lib/connection-key.server";

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
export async function ensureBankWallet(handle: string, userId: string | null): Promise<BankWallet> {
  const existing = await findBankWallet(handle);
  if (existing) {
    if (userId && !existing.user_id) {
      const db = await admin();
      await db.from("bank_wallets").update({ user_id: userId }).eq("x_username", handle.toLowerCase());
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
  const { rpc } = await chain();
  const balances = await rpc<{ coinType: string; totalBalance: string }[]>("suix_getAllBalances", [address]);
  return balances.filter((b) => BigInt(b.totalBalance) > 0n).map((b) => ({ coinType: normalizeStructTag(b.coinType), balance: BigInt(b.totalBalance) }));
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
    const page = await rpc<{ data: { coinObjectId: string; version: string; digest: string; balance: string }[] }>(
      "suix_getCoins",
      [sender, type, null, 50],
    );
    const coins = page.data ?? [];
    if (coins.length === 0) return { ok: false, error: "No coins of that type in your OurBank wallet." };
    const refs = coins.map((c) => tx.objectRef({ objectId: c.coinObjectId, version: String(c.version), digest: c.digest }));
    const [primary, ...rest] = refs;
    if (rest.length) tx.mergeCoins(primary!, rest);
    if (amount === null) tx.transferObjects([primary!], tx.pure.address(to));
    else tx.transferObjects([tx.splitCoins(primary!, [tx.pure.u64(amount)])[0]!], tx.pure.address(to));
  }

  const executed = await signAndExecute(tx, signer);
  if (!executed.ok || !executed.digest) return { ok: false, error: executed.error ?? "Transaction failed." };
  return { ok: true, digest: executed.digest };
}

export { GAS_BUDGET, SUI_TYPE };
