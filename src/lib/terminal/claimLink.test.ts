// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { readClaimLinkRequest , matchLaunchesByAddress } from "./xClaim.server";
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

describe("coin type addresses", () => {
  const ct = "0x2a7803434c3e35a8d899340aa20cc9d5ddd2e5469a7d21b265ed00fd18bc04f9::suipump::SUIPUMP";
  it("reads the full coin type, keeping its case", () => {
    expect(readClaimLinkRequest(`@Ourblastbot generate claim link for @EmanAbio on ${ct}`)).toEqual({ xUsername: "EmanAbio", symbol: null, address: ct });
  });
  it("matches a coin type to a launch stored by its coin type package", async () => {
    const rows = [{ symbol: "CZ", token_address: "0x32a8c091dfbb48c793ad3919114924b87e1dbfef7644b557cb0ca8df65754586::cz::CZ" }];
    expect(await matchLaunchesByAddress(rows, "0x32a8c091dfbb48c793ad3919114924b87e1dbfef7644b557cb0ca8df65754586::cz::CZ")).toHaveLength(1);
  });
});

describe("fee claim with payout destination", () => {
  const w = "0x" + "ab".repeat(32);
  it("ignores destination wallet", async () => {
    const { readFeeClaimRequest } = await import("./xClaim.server");
    expect(readFeeClaimRequest(`@Ourblastbot claim my fees and send to ${w}`)?.address).toBeNull();
  });
  it("ticker wins over address", async () => {
    const { readFeeClaimRequest } = await import("./xClaim.server");
    const r = readFeeClaimRequest(`claim my fees on $GROKLET and send to ${w}`);
    expect(r?.symbol).toBe("GROKLET");
    expect(r?.address).toBeNull();
  });
});
