// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { solAddressFromSecret } from "./bank-sol.server";

describe("OurBank Solana address", () => {
  it("derives the standard Solana address from an Ed25519 secret (RFC 8032 test vector 1)", () => {
    const secret = Uint8Array.from(Buffer.from("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60", "hex"));
    // pubkey d75a9801…511a encoded in base58
    expect(solAddressFromSecret(secret)).toBe("FVen3X669xLzsi6N2V91DoiyzHzg1uAgqiT8jZ9nS96Z");
  });
});
