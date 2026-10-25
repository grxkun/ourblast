// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { KIOSK_RULES_PKG, unsupportedRules } from "./kiosk";

describe("kiosk transfer rules", () => {
  it("accepts royalty and kiosk-lock rules", () => {
    expect(unsupportedRules([`${KIOSK_RULES_PKG}::royalty_rule::Rule`, `${KIOSK_RULES_PKG}::kiosk_lock_rule::Rule`])).toEqual([]);
  });
  it("refuses any other rule so a send never guesses", () => {
    expect(unsupportedRules([`${KIOSK_RULES_PKG}::floor_price_rule::Rule`])).toHaveLength(1);
    expect(unsupportedRules(["0xabc::custom::Rule"])).toHaveLength(1);
  });
});
