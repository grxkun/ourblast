// SPDX-License-Identifier: BUSL-1.1
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";

import { encryptConnectionKey } from "@/lib/connection-key.server";

/**
 * Multi-chain OurBank: every bank wallet gets one Solana deposit address.
 * Turnkey enclave key when configured, else a locally AES-encrypted Ed25519
 * key. Only the address leaves the server. Created lazily, never replaced.
 */
export function solAddressFromSecret(secret: Uint8Array): string {
  return bs58.encode(ed25519.getPublicKey(secret));
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function ensureSolDepositAddress(handle: string): Promise<string | null> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const key = handle.toLowerCase();
  const { data: row } = await db.from("bank_wallets").select("sol_address").eq("x_username", key).maybeSingle();
  if (!row) return null;
  if (row.sol_address) return row.sol_address;

  const tk = await import("./turnkey.server");
  let update: { sol_address: string; sol_secret_ciphertext: string | null; sol_signing_backend: string; sol_turnkey_wallet_id: string | null };
  try {
    if (!tk.turnkeyConfigured()) throw new Error("no turnkey");
    const acct = await tk.createSolanaWallet(`ourbank-sol-${key}-${Date.now()}`);
    update = { sol_address: acct.address, sol_secret_ciphertext: null, sol_signing_backend: "turnkey", sol_turnkey_wallet_id: acct.walletId };
  } catch {
    const secret = ed25519.utils.randomSecretKey();
    update = {
      sol_address: solAddressFromSecret(secret),
      sol_secret_ciphertext: encryptConnectionKey(hex(secret)),
      sol_signing_backend: "local",
      sol_turnkey_wallet_id: null,
    };
  }
  // Only fill an empty slot — a concurrent call that won keeps its address.
  await db.from("bank_wallets").update(update).eq("x_username", key).is("sol_address", null);
  const { data: after } = await db.from("bank_wallets").select("sol_address").eq("x_username", key).maybeSingle();
  return after?.sol_address ?? null;
}
