// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { isV18TicketType, SUIPUMP_V18_DEFINING } from "./suipump-launch";

describe("Suipump V18 lineage detection", () => {
  it("routes a V18 launch ticket to the protected flow", () => {
    expect(isV18TicketType(`${SUIPUMP_V18_DEFINING}::authority::LaunchTicket<0xabc::coin::COIN>`)).toBe(true);
  });
  it("keeps V17 tickets on the legacy flow", () => {
    expect(
      isV18TicketType(
        "0xb205fea41ccedac051bc66498e6ca68cb802c4a6ea06da12e524bed09c80d9b0::bonding_curve::LaunchTicket<0xabc::coin::COIN>",
      ),
    ).toBe(false);
  });
});
