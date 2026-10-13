// SPDX-License-Identifier: BUSL-1.1
import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { buildMayanTx, forwarderAbi, MAYAN_FORWARDER, type MayanQuote } from "./mayan-evm";

const SUI_DEST = "0x9f6956bdaf667bb7484aa97c65a003760da8e787f8e1d6b0f56c1d8c037322da";
const base: MayanQuote = {
  type: "MCTP", hasAuction: true, fromChain: "base", toChain: "sui",
  fromToken: { contract: "0x0000000000000000000000000000000000000000" },
  toToken: { contract: "0x2::sui::SUI", verifiedAddress: "0x9258181f5ceac8dbffb7030890243caed69a9599d2886d957a9cb7656af3bdb3", decimals: 9 },
  effectiveAmountIn64: "1700000000000000", bridgeFee: 0, gasDrop: 0, redeemRelayerFee: 0.868536, minAmountOut: 3.11,
  minMiddleAmount: 3, mctpInputContract: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  mctpMayanContract: "0x875d6d37EC55c8cF220B9E5080717549d8Aa8EcA", deadline64: "1791858298", slippageBps: 300,
};

describe("Mayan EVM → Sui builder", () => {
  it("ETH deposit sends the full amount through swapAndForwardEth", () => {
    const tx = buildMayanTx(base, SUI_DEST, { swapRouterAddress: "0xC87De04e2EC1F4282dFF2933A2D58199f688fC3d", swapRouterCalldata: "0x1234" });
    expect(tx.to).toBe(MAYAN_FORWARDER);
    expect(tx.value).toBe(1_700_000_000_000_000n);
    expect(decodeFunctionData({ abi: forwarderAbi, data: tx.data }).functionName).toBe("swapAndForwardEth");
  });
  it("USDC deposit uses forwardERC20 with no ETH value", () => {
    const tx = buildMayanTx({ ...base, fromToken: { contract: base.mctpInputContract }, effectiveAmountIn64: "5000000" }, SUI_DEST);
    expect(tx.value).toBe(0n);
    const d = decodeFunctionData({ abi: forwarderAbi, data: tx.data });
    expect(d.functionName).toBe("forwardERC20");
    expect(d.args[1]).toBe(5_000_000n);
  });
  it("refuses a non-Sui destination", () => {
    expect(() => buildMayanTx(base, "0xb80d720d94ba7365181023872202b9dee037893d")).toThrow();
  });
});
