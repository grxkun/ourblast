import { describe, expect, it } from "vitest";
import { readClaimLinkRequest } from "./xClaim.server";
import { readFeeClaimRequest } from "./xClaim.server";

describe("claim link command", () => {
  it("reads handle and ticker, skipping the bot handle", () => {
    expect(readClaimLinkRequest("@Ourblastbot generate claim link for @eman_abio on $groklet")).toEqual({ xUsername: "eman_abio", symbol: "GROKLET" });
  });
  it("ignores unrelated text", () => {
    expect(readClaimLinkRequest("claim my fees on $GROKLET")).toBeNull();
  });
  it("is not treated as a fee release", () => {
    expect(readFeeClaimRequest("generate claim link for @eman_abio on $GROKLET")).toBeNull();
  });
});
