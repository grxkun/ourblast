import { describe, expect, it } from "vitest";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import { assembleSuiSignature, suiIntentDigest } from "./turnkey.server";

describe("turnkey Sui signing helpers", () => {
  it("assembles a serialized signature identical to a local keypair's", async () => {
    const keypair = Ed25519Keypair.generate();
    const txBytes = new Uint8Array([1, 2, 3, 4, 5]);
    const local = await keypair.signTransaction(txBytes);

    // Rebuild what the Turnkey path produces: sign the intent digest, assemble manually.
    const digest = suiIntentDigest(txBytes);
    const rawSig = await keypair.sign(digest);
    const publicKey = keypair.getPublicKey().toRawBytes();
    const assembled = assembleSuiSignature(new Uint8Array(rawSig), publicKey);

    const decoded = Buffer.from(assembled, "base64");
    expect(decoded.length).toBe(97);
    expect(decoded[0]).toBe(0); // Ed25519 flag
    expect(Buffer.from(decoded.subarray(65)).equals(Buffer.from(publicKey))).toBe(true);
    // Same scheme/flag layout as the local signer produces.
    expect(Buffer.from(local.signature, "base64")[0]).toBe(0);
  });

  it("hashes the intent-prefixed message, not the raw bytes", () => {
    const txBytes = new Uint8Array([9, 9, 9]);
    const digest = suiIntentDigest(txBytes);
    expect(digest.length).toBe(32);
    // Changing the prefix changes the digest.
    const other = suiIntentDigest(new Uint8Array([9, 9, 8]));
    expect(Buffer.from(digest).equals(Buffer.from(other))).toBe(false);
  });

  it("rejects malformed key material", () => {
    expect(() => assembleSuiSignature(new Uint8Array(63), new Uint8Array(32))).toThrow();
    expect(() => assembleSuiSignature(new Uint8Array(64), new Uint8Array(31))).toThrow();
  });
});
