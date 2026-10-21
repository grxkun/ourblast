// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";

import { alertText } from "./alerts.server";

describe("alertText", () => {
  it("announces a deployed launch with its link", () => {
    expect(alertText({ symbol: "CZ", status: "DEPLOYED", launchpad: "suipump", token_url: "https://x.y" })).toBe("✅ $CZ is live on suipump\nhttps://x.y");
  });
  it("reports a failed launch", () => {
    expect(alertText({ symbol: "CZ", status: "FAILED", launchpad: "suipump", token_url: null })).toContain("did not complete");
  });
});
