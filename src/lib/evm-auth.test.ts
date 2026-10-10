import { describe, expect, it } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

import { evmLoginMessage, recoverEvmAddress } from "./evm-auth";

function sign(priv: Uint8Array, message: string) {
  const m = new TextEncoder().encode(message);
  const p = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${m.length}`);
  const full = new Uint8Array([...p, ...m]);
  const rec = secp256k1.sign(keccak_256(full), priv, { prehash: false, format: "recovered" });
  // noble: [v, r, s] -> EVM: r||s||v+27
  const out = new Uint8Array([...rec.slice(1), rec[0]! + 27]);
  return "0x" + Array.from(out, (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("EVM login", () => {
  // Well-known Hardhat account #0
  const priv = Uint8Array.from(Buffer.from("ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", "hex"));
  const addr = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

  it("recovers the signing address", () => {
    const msg = evmLoginMessage(addr, "2026-10-10T00:00:00.000Z");
    expect(recoverEvmAddress(msg, sign(priv, msg))).toBe(addr);
  });

  it("rejects a signature over a different message", () => {
    const sig = sign(priv, evmLoginMessage(addr, "2026-10-10T00:00:00.000Z"));
    expect(recoverEvmAddress(evmLoginMessage(addr, "2026-10-11T00:00:00.000Z"), sig)).not.toBe(addr);
  });
});
