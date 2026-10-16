import { describe, expect, it } from "vitest";
import { readClaimLinkRequest } from "./xClaim.server";
import { readFeeClaimRequest } from "./xClaim.server";

describe("claim link command", () => {
  it("reads handle and ticker, skipping the bot handle", () => {
    expect(readClaimLinkRequest("@Ourblastbot generate claim link for @eman_abio on $groklet")).toEqual({ xUsername: "eman_abio", symbol: "GROKLET", address: null });
  });
  it("accepts a contract address instead of a ticker", () => {
    const ca = "0xd4d51a391e3482cdcea9ad767816b297f0a31e8ed15da11677f04514f2e77021";
    expect(readClaimLinkRequest(`generate claim link for @eman_abio on ${ca}`)).toEqual({ xUsername: "eman_abio", symbol: null, address: ca });
    expect(readFeeClaimRequest(`claim my fees on ${ca}`)).toEqual({ symbol: null, address: ca, redirectAsked: false });
  });
  it("ignores unrelated text", () => {
    expect(readClaimLinkRequest("claim my fees on $GROKLET")).toBeNull();
  });
  it("is not treated as a fee release", () => {
    expect(readFeeClaimRequest("generate claim link for @eman_abio on $GROKLET")).toBeNull();
  });
});
