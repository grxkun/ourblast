// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { evmAddressFromPrivateKey } from "./bank-evm.server";

describe("OurBank EVM deposit address", () => {
  it("derives the standard address for private key 1", () => {
    const priv = new Uint8Array(32); priv[31] = 1;
    expect(evmAddressFromPrivateKey(priv)).toBe("0x7e5f4552091a69125d5dfcb7b8c2659029395bdf");
  });
});
