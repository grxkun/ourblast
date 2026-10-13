// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";

import { associatedTokenAddress, planSolSweep, SOL_USDC_MINT, solTransferMessage, usdcTransferMessage } from "./sol-sweep";

const A = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLwnzjKZqjpf";
const B = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
const HASH = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N";

describe("SOL sweep rules", () => {
  it("sweeps USDC first when SOL covers its fees", () => {
    expect(planSolSweep(3_000_000n, 5_000_000n)).toEqual({ token: "USDC", amount: 5_000_000n });
  });
  it("needs at least 2 USDC", () => {
    expect(planSolSweep(3_000_000n, 1_999_999n)).toBeNull();
  });
  it("sweeps all SOL minus the network fee from 0.02 SOL", () => {
    expect(planSolSweep(20_000_000n, 0n)).toEqual({ token: "SOL", amount: 19_995_000n });
    expect(planSolSweep(19_999_999n, 0n)).toBeNull();
  });
  it("skips USDC without SOL for fees", () => {
    expect(planSolSweep(1_000_000n, 50_000_000n)).toBeNull();
  });
});

describe("Solana transaction building", () => {
  it("derives a real mainnet USDC token account", () => {
    expect(associatedTokenAddress("3oNW5dwqcfct5Nj7QLstiAwE7rZFTpBeiHp8pET7z5s4", SOL_USDC_MINT)).toBe("6y3N8YE5zdunhuRPPeKF2orZCLfBVNtsqHbLbWCTbHFF");
  });
  it("encodes a SOL transfer: 3 accounts, system transfer of the exact lamports", () => {
    const m = solTransferMessage(A, B, 123_456_789n, HASH);
    expect([m[0], m[1], m[2], m[3]]).toEqual([1, 0, 1, 3]);
    const data = m.slice(-12);
    expect(Array.from(data.slice(0, 4))).toEqual([2, 0, 0, 0]);
    expect(Buffer.from(data.slice(4)).readBigUInt64LE()).toBe(123_456_789n);
  });
  it("builds a USDC message with 8 accounts and 2 instructions", () => {
    const m = usdcTransferMessage(A, B, 5_000_000n, HASH);
    expect([m[0], m[1], m[2], m[3]]).toEqual([1, 0, 5, 8]);
  });
});
