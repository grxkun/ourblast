// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";

import { shortType, toRpcFields } from "./sui-rpc-compat.server";

describe("sui JSON-RPC compatibility", () => {
  it("prints framework types in short form but keeps user packages intact", () => {
    expect(shortType("0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI")).toBe("0x2::sui::SUI");
    const user = "0x002699f9e86ddf0b9e68197077f5eff7d4d0fa6c97ce20eafe11bd4b84de34b4::suipump::SUIPUMP";
    expect(shortType(user)).toBe(user);
  });

  it("lets nested structs be read both flat and through .fields", () => {
    const out = toRpcFields({ payouts: [{ recipient: "0xabc", bps: "8000" }], id: "0x1" }) as {
      payouts: { fields: { bps: string }; bps: string }[];
      id: { id: string };
    };
    expect(out.payouts[0]!.fields.bps).toBe("8000");
    expect(out.payouts[0]!.bps).toBe("8000");
    expect(out.id.id).toBe("0x1");
  });
});
