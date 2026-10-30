// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { isBlastV2Presale } from "./bank-wallet.server";

describe("Blast v2 presale package", () => {
  it("trusts the official v2 presale package", () => {
    expect(isBlastV2Presale("0xb0279fbe54bfd1d920e985a4dba0916b2b73a5218514edeecb7b9dd30cf2863b")).toBe(true);
  });
  it("rejects look-alike packages", () => {
    expect(isBlastV2Presale("0xb0279fbe54bfd1d920e985a4dba0916b2b73a5218514edeecb7b9dd30cf2863c")).toBe(false);
  });
});
