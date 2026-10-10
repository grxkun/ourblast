// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { ALTERNATE_ROUTES, MAYAN_SOURCE_CHAINS } from "./crossChain";

describe("buy popup routes", () => {
  it("lets users pay from HyperEVM inside the swap", () => {
    expect(MAYAN_SOURCE_CHAINS).toContain("hyperevm");
  });
  it("lets users pay from Monad inside the swap", () => {
    expect(MAYAN_SOURCE_CHAINS).toContain("monad");
  });
  it("sends NEAR users to NEAR Intents, which lands SUI directly", () => {
    expect(ALTERNATE_ROUTES.near.url).toBe("https://app.near-intents.org");
    expect(ALTERNATE_ROUTES.near.landsOnSui).toBe(true);
  });
  it("sends Robinhood Chain users via Relay to a chain the swap supports", () => {
    expect(ALTERNATE_ROUTES.robinhood.url).toBe("https://relay.link/bridge");
    for (const hop of ALTERNATE_ROUTES.robinhood.hopTo) expect(MAYAN_SOURCE_CHAINS).toContain(hop);
  });
});

import { crossChainUsdcSwapAmount } from "./crossChain";
describe("Arc / CCTP USDC deposits", () => {
  it("lists Arc as a CCTP route that lands on Sui", () => {
    expect(ALTERNATE_ROUTES.arc.landsOnSui).toBe(true);
  });
  it("swaps the whole USDC deposit of at least 1 USDC", () => {
    expect(crossChainUsdcSwapAmount(0n, 5_000_000n)).toBe(5_000_000n);
    expect(crossChainUsdcSwapAmount(2_000_000n, 2_900_000n)).toBe(0n);
  });
});
