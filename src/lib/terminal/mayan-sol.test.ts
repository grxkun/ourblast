// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";

import { fractional, ledgerOrderIx, type MayanSolQuote } from "./mayan-sol";

const quote = {
  type: "MCTP", hasAuction: true, fromChain: "solana", toChain: "sui",
  fromToken: { contract: "0x0000000000000000000000000000000000000000" },
  toToken: { contract: "0x2::sui::SUI", verifiedAddress: "0x" + "00".repeat(31) + "02", decimals: 9 },
  effectiveAmountIn64: "100000000", expectedAmountOut: 9.7, minAmountOut: 9.4, minMiddleAmount: 14.2,
  mctpInputContract: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", deadline64: "1792680328",
  gasDrop: 0, redeemRelayerFee: 0.702885, solanaRelayerFee64: "216601", slippageBps: 300,
} satisfies MayanSolQuote;

describe("mayan SOL → SUI", () => {
  it("truncates amounts like the SDK", () => {
    expect(fractional(14.2, 6)).toBe(14_200_000n);
    expect(fractional(9.4, 9)).toBe(9_400_000_000n);
  });

  it("writes the Sui destination into the ledger order", () => {
    const dest = "0x" + "ab".repeat(32);
    const ix = ledgerOrderIx({ user: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", ledger: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", randomKey: new Uint8Array(32), suiDest: dest, quote, feeSolana: 216601n });
    expect(ix.data.length).toBe(8 + 32 + 8 * 4 + 2 + 32 + 1 + 32 + 8 + 8 + 32 + 1);
    expect(Buffer.from(ix.data.subarray(8, 40)).toString("hex")).toBe("ab".repeat(32));
  });
});
