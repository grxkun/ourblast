import { test, expect } from "vitest";
import { readFeeCheckRequest, readFeeClaimRequest } from "./xClaim.server";
test("check", () => {
  expect(readFeeCheckRequest("@Ourblastbot check fees $HOLMOT")).toEqual({ symbol: "HOLMOT" });
  expect(readFeeCheckRequest("@Ourblastbot my fees")).toEqual({ symbol: null });
  expect(readFeeCheckRequest("how much fee do i have?")).toEqual({ symbol: null });
  expect(readFeeCheckRequest("$blast fees")).toEqual({ symbol: "BLAST" });
  expect(readFeeCheckRequest("claim my fees")).toBeNull();
  expect(readFeeClaimRequest("claim my fees")).not.toBeNull();
});

test("claim accepts send/transfer phrasing but not bank transfers", () => {
  expect(readFeeClaimRequest("@Ourblastbot Claim my fees and send it to Mjbdran.sui")).toEqual({
    symbol: null,
    redirectAsked: true,
  });
  expect(readFeeClaimRequest("@Ourblastbot claim fees $HOLMOT and transfer to me")).toEqual({
    symbol: "HOLMOT",
    redirectAsked: true,
  });
  expect(readFeeClaimRequest("@Ourblastbot send 1 SUI to 0xabc")).toBeNull();
  expect(readFeeClaimRequest("@Ourblastbot buy me $HOLMOT with 1 SUI")).toBeNull();
});

