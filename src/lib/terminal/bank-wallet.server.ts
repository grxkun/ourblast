import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeStructTag, normalizeSuiAddress } from "@mysten/sui/utils";

import { decryptConnectionKey, encryptConnectionKey } from "@/lib/connection-key.server";

/**
 * OurBank wallets: one bot-held Sui wallet per X account, like Bankrbot. The
 * signing key is generated here, encrypted at once and never returned to any
 * caller — only the address leaves the server. Tweets spend from it instantly.
 */
const SUI_TYPE = normalizeStructTag("0x2::sui::SUI");
const GAS_BUDGET = 10_000_000n; // 0.01 SUI

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
async function chain() {
  return import("./suipump-launch.server");
}

export interface BankWallet { address: string; x_username: string; user_id: string | null }

export async function findBankWallet(handle: string): Promise<(BankWallet & { secret_ciphertext: string }) | null> {
  const db = await admin();
  const { data } = await db
    .from("bank_wallets")
    .select("address, x_username, user_id, secret_ciphertext")
    .eq("x_username", handle.toLowerCase())
    .maybeSingle();
  return data ?? null;
}

/** Existing wallet for this X handle, or a freshly generated one. */
export async function ensureBankWallet(handle: string, userId: string | null): Promise<BankWallet> {
  const existing = await findBankWallet(handle);
  if (existing) {
    if (userId && !existing.user_id) {
      const db = await admin();
      await db.from("bank_wallets").update({ user_id: userId }).eq("x_username", handle.toLowerCase());
    }
    return { address: existing.address, x_username: existing.x_username, user_id: existing.user_id ?? userId };
  }
  const keypair = Ed25519Keypair.generate();
  const row = {
    x_username: handle.toLowerCase(),
    user_id: userId,
    address: keypair.getPublicKey().toSuiAddress(),
    secret_ciphertext: encryptConnectionKey(keypair.getSecretKey()),
  };
  const db = await admin();
  const { error } = await db.from("bank_wallets").insert(row);
  if (error?.code === "23505") return ensureBankWallet(handle, userId); // created concurrently
  if (error) throw new Error(error.message);
  return { address: row.address, x_username: row.x_username, user_id: userId };
}

export async function bankBalances(address: string) {
  const { rpc } = await chain();
  const balances = await rpc<{ coinType: string; totalBalance: string }[]>("suix_getAllBalances", [address]);
  return balances.filter((b) => BigInt(b.totalBalance) > 0n).map((b) => ({ coinType: normalizeStructTag(b.coinType), balance: BigInt(b.totalBalance) }));
}

type Result = { ok: true; digest: string } | { ok: false; error: string };

/** Sends `amount` of `coinType` (or everything, when amount is null) from a bank wallet. */
export async function sendFromBankWallet(
  wallet: { address: string; secret_ciphertext: string },
  coinType: string,
  amount: bigint | null,
  recipient: string,
): Promise<Result> {
  const { gasCoins, referenceGasPrice, rpc, withGas, signAndExecute } = await chain();
  const keypair = Ed25519Keypair.fromSecretKey(decryptConnectionKey(wallet.secret_ciphertext));
  const sender = keypair.getPublicKey().toSuiAddress();
  if (sender !== normalizeSuiAddress(wallet.address)) return { ok: false, error: "Bank wallet key mismatch." };
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

  const executed = await signAndExecute(tx, keypair);
  if (!executed.ok || !executed.digest) return { ok: false, error: executed.error ?? "Transaction failed." };
  return { ok: true, digest: executed.digest };
}

export { GAS_BUDGET, SUI_TYPE };
