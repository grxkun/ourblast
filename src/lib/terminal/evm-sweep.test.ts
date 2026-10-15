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

import { decodeSolHop, encodeSolHop, solHopAmount } from "./evm-sweep";
describe("BNB → SOL → SUI hop", () => {
  it("waits until Relay's SOL has arrived", () => {
    expect(solHopAmount(340_000_000n, 100_000_000n)).toBe(0n);
  });
  it("sends exactly the Relay output when it has landed", () => {
    expect(solHopAmount(340_000_000n, 400_000_000n)).toBe(340_000_000n);
  });
  it("keeps 0.003 SOL for fees when only the hop amount is there", () => {
    expect(solHopAmount(340_000_000n, 340_000_000n)).toBe(337_000_000n);
  });
  it("skips hops under the 0.02 SOL minimum", () => {
    expect(solHopAmount(15_000_000n, 50_000_000n)).toBe(0n);
  });
  it("round-trips the hop note", () => {
    expect(decodeSolHop(encodeSolHop(5n, true))).toEqual({ lamports: 5n, keep: true });
    expect(decodeSolHop("0xabc")).toBeNull();
  });
});
