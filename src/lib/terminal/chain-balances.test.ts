// SPDX-License-Identifier: BUSL-1.1
import bs58 from "bs58";
import { describe, expect, it } from "vitest";

import { solAddressFromSecret } from "./bank-sol.server";
import { solExportKey } from "./chain-balances.server";

describe("solExportKey", () => {
  it("exports 64-byte seed+pubkey whose second half is the deposit address", () => {
    const seedHex = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
    const bytes = bs58.decode(solExportKey(seedHex));
    expect(bytes.length).toBe(64);
    expect(bs58.encode(bytes.slice(32))).toBe(solAddressFromSecret(Uint8Array.from(Buffer.from(seedHex, "hex"))));
  });
});
