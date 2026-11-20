// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { isBlastV2Presale } from "./bank-wallet.server";

describe("Blast v2 presale package", () => {
  it("trusts the official v2 presale package", () => {
    expect(isBlastV2Presale("0x1f44a8e9fab4380228fe9c1bcc27d99b7f6ea76a8e18b5c178ca18cd46fb33c4")).toBe(true);
  });
  it("rejects look-alike packages", () => {
    expect(isBlastV2Presale("0x1f44a8e9fab4380228fe9c1bcc27d99b7f6ea76a8e18b5c178ca18cd46fb33c5")).toBe(false);
  });
  it("does not classify the prelaunch deployment as production", () => {
    expect(isBlastV2Presale("0xb0279fbe54bfd1d920e985a4dba0916b2b73a5218514edeecb7b9dd30cf2863b")).toBe(false);
  });
});
