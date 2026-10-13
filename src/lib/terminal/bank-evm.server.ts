// SPDX-License-Identifier: BUSL-1.1
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

import { encryptConnectionKey } from "@/lib/connection-key.server";

/**
 * Phase 1 of multi-chain OurBank: every bank wallet gets one EVM deposit
 * address (identical on Base, Arbitrum, Ethereum, Robinhood Chain…). Created
 * in Turnkey when configured, else a locally AES-encrypted key. Only the
 * address ever leaves the server. Created lazily, never replaced once set.
 */
function hex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function evmAddressFromPrivateKey(priv: Uint8Array): string {
  const pub = secp256k1.getPublicKey(priv, false);
  return "0x" + hex(keccak_256(pub.slice(1)).slice(-20));
}

export async function ensureEvmDepositAddress(handle: string): Promise<string | null> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const key = handle.toLowerCase();
  const { data: row } = await db.from("bank_wallets").select("evm_address").eq("x_username", key).maybeSingle();
  if (!row) return null;
  if (row.evm_address) return row.evm_address;

  const tk = await import("./turnkey.server");
  let update: { evm_address: string; evm_secret_ciphertext: string | null; evm_signing_backend: string; evm_turnkey_wallet_id: string | null };
  try {
    if (!tk.turnkeyConfigured()) throw new Error("no turnkey");
    const acct = await tk.createEvmWallet(`ourbank-evm-${key}-${Date.now()}`);
    update = { evm_address: acct.address, evm_secret_ciphertext: null, evm_signing_backend: "turnkey", evm_turnkey_wallet_id: acct.walletId };
  } catch {
    const priv = secp256k1.utils.randomSecretKey();
    update = {
      evm_address: evmAddressFromPrivateKey(priv),
      evm_secret_ciphertext: encryptConnectionKey(hex(priv)),
      evm_signing_backend: "local",
      evm_turnkey_wallet_id: null,
    };
  }
  // Only fill an empty slot — a concurrent call that won keeps its address.
  await db.from("bank_wallets").update(update).eq("x_username", key).is("evm_address", null);
  const { data: after } = await db.from("bank_wallets").select("evm_address").eq("x_username", key).maybeSingle();
  return after?.evm_address ?? null;
}
