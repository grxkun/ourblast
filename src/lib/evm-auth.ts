// SPDX-License-Identifier: BUSL-1.1
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

export function evmLoginMessage(address: string, issuedAt: string) {
  return [
    "OURBLAST — sign in with your EVM wallet",
    "This free signature never moves funds or reveals your keys.",
    `Wallet: ${address.toLowerCase()}`,
    `Issued: ${issuedAt}`,
  ].join("\n");
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Recovers the lowercase 0x address that produced an EIP-191 personal_sign. */
export function recoverEvmAddress(message: string, signature: string): string {
  const msg = new TextEncoder().encode(message);
  const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${msg.length}`);
  const full = new Uint8Array(prefix.length + msg.length);
  full.set(prefix);
  full.set(msg, prefix.length);
  const digest = keccak_256(full);

  const raw = signature.replace(/^0x/, "");
  let v = parseInt(raw.slice(128, 130), 16);
  if (v >= 27) v -= 27;
  if (v !== 0 && v !== 1) throw new Error("Bad signature.");
  const sig = new Uint8Array(65);
  sig[0] = v;
  for (let i = 0; i < 64; i++) sig[i + 1] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  const pub = secp256k1.recoverPublicKey(sig, digest, { prehash: false });
  const uncompressed = secp256k1.Point.fromBytes(pub).toBytes(false);
  return "0x" + hex(keccak_256(uncompressed.slice(1)).slice(-20));
}
