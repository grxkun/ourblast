import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import { encryptConnectionKey } from "@/lib/connection-key.server";

/**
 * The OURBLAST gas reserve is a Sui account created by the app itself. Its
 * signing key is generated on the server, encrypted immediately and never
 * leaves the backend — no person (including the operators) ever sees it, so the
 * reserve can only ever be spent by the sponsor code in this repository.
 */
export type GasReserveRow = {
  address: string;
  secret_ciphertext: string;
  contributed_sui: number;
  created_at: string;
};

export function createReserveAccount(): { address: string; secretCiphertext: string } {
  const keypair = Ed25519Keypair.generate();
  return {
    address: keypair.getPublicKey().toSuiAddress(),
    // Encrypted before it is ever returned; the plaintext key stays in this call frame.
    secretCiphertext: encryptConnectionKey(keypair.getSecretKey()),
  };
}

/**
 * Adopts the operator-supplied @ourblastbot wallet as the gas reserve. The key
 * is read from the backend secret store inside this call, encrypted at rest and
 * never returned to any caller — only the public address leaves the server.
 */
export function importReserveAccountFromSecret(): { address: string; secretCiphertext: string } {
  const raw = process.env['OURBLASTBOT_SUI_SECRET_KEY'];
  if (!raw) throw new Error("The @ourblastbot wallet key is not configured.");
  let keypair: Ed25519Keypair;
  try {
    keypair = Ed25519Keypair.fromSecretKey(raw.trim());
  } catch {
    throw new Error("That @ourblastbot wallet key is not a valid Sui private key.");
  }
  return {
    address: keypair.getPublicKey().toSuiAddress(),
    secretCiphertext: encryptConnectionKey(keypair.getSecretKey()),
  };
}
