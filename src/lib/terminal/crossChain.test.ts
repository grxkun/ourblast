// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { crossChainSwapAmount } from "./crossChain";

describe("crossChainSwapAmount", () => {
  it("waits while less than 0.1 SUI has arrived", () => {
    expect(crossChainSwapAmount(1_000_000_000n, 1_090_000_000n)).toBe(0n);
  });
  it("swaps the bridged SUI minus 0.05 SUI kept for gas", () => {
    expect(crossChainSwapAmount(1_000_000_000n, 6_000_000_000n)).toBe(4_950_000_000n);
  });
  it("never touches SUI that was already in the wallet", () => {
    expect(crossChainSwapAmount(5_000_000_000n, 5_000_000_000n)).toBe(0n);
  });
});
