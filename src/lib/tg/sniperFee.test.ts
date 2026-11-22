// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { splitSniperFee, SNIPER_FEE_RECIPIENTS } from "./sniperFee";

describe("sniper fee", () => {
  it("takes 1% to dev and 0.5% to treasury from a 10 SUI snipe", () => {
    expect(splitSniperFee(10_000_000_000n)).toEqual({ dev: 100_000_000n, treasury: 50_000_000n, net: 9_850_000_000n });
  });
  it("routes dev share to the dev wallet and the rest to treasury", () => {
    expect(SNIPER_FEE_RECIPIENTS.dev).toBe("0xa0ec4ee84d06471499e3d512d9d8af9bab40e6aeb6dfa197f16366e70e2660c4");
    expect(SNIPER_FEE_RECIPIENTS.treasury).toBe("0xd9ba2ba33cc6eb61302cec564126caae22fbbe10f564789c5e6e5eca0940372c");
  });
});
