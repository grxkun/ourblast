// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { parseEvmBridgeCommand } from "./evmBridge";

describe("parseEvmBridgeCommand", () => {
  it("reads Mamoun's exact commands", () => {
    expect(parseEvmBridgeCommand("Bridge 0.013 bnb to sui")).toEqual({ asset: "BNB", amount: 0.013 });
    expect(parseEvmBridgeCommand("Bridge all bnb to sui")).toEqual({ asset: "BNB", amount: "all" });
  });
  it("reads ETH with a network", () => {
    expect(parseEvmBridgeCommand("@Ourblastbot bridge 0.002 eth on base to sui")).toEqual({ asset: "ETH", amount: 0.002, chain: "base" });
  });
  it("leaves outbound SUI bridges alone", () => {
    expect(parseEvmBridgeCommand("bridge 10 sui to bnb")).toBeNull();
    expect(parseEvmBridgeCommand("bridge 0.05 sol to sui")).toBeNull();
  });
});
