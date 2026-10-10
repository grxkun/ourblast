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
