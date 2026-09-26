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
