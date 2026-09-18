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
