// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { ethSweepAmount, sweepAllowed, usdcSweepAmount } from "./evm-sweep";
import { pauseEnd } from "./x-api.server";

describe("EVM deposit sweep rules", () => {
  it("ignores ETH below 0.0015", () => {
    expect(ethSweepAmount(1_400_000_000_000_000n)).toBe(0n);
  });
  it("moves ETH minus 0.0003 kept for fees", () => {
    expect(ethSweepAmount(2_000_000_000_000_000n)).toBe(1_700_000_000_000_000n);
  });
  it("ignores USDC below 2", () => {
    expect(usdcSweepAmount(1_999_999n, 10n ** 18n).amount).toBe(0n);
  });
  it("waits for ETH before moving USDC", () => {
    expect(usdcSweepAmount(5_000_000n, 0n).reason).toBe("needs_gas");
  });
  it("is off unless a handle is allowed", () => {
    expect(sweepAllowed(undefined, "grxxxkun")).toBe(false);
    expect(sweepAllowed("@GRXXXKUN", "grxxxkun")).toBe(true);
    expect(sweepAllowed("other", "grxxxkun")).toBe(false);
  });
});

describe("X bot pause", () => {
  it("a 48 hour pause ends 48h after it was first seen", () => {
    expect(pauseEnd("48 hour", new Date("2026-10-11T11:25:00Z"))?.toISOString()).toBe("2026-10-13T11:25:00.000Z");
  });
});

import { ethSweepAmount as nativeSweep } from "./evm-sweep";
describe("BNB sweep rules", () => {
  it("leaves BNB under 0.01 alone", () => expect(nativeSweep(9_999_999_999_999_999n, "BNB")).toBe(0n));
  it("keeps 0.0005 BNB for fees", () => expect(nativeSweep(20_000_000_000_000_000n, "BNB")).toBe(19_500_000_000_000_000n));
});
