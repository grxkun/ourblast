// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";

import { mayanLamports } from "./sol-sweep.server";

describe("Mayan SOL reserve", () => {
  it("bridging all 0.325594678 SOL keeps 0.012 SOL for rent/fees", () => {
    expect(mayanLamports(325_589_678n, 325_594_678n)).toBe(313_594_678n);
  });
  it("never bridges more than requested", () => {
    expect(mayanLamports(100_000_000n, 325_594_678n)).toBe(100_000_000n);
  });
});
