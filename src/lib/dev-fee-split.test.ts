// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/terminal/suipump-launch.server", () => ({}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import { decodeFeeSplit } from "./dev-fee.functions";

describe("decodeFeeSplit", () => {
  it("reads a single 100% payee from a real Suipump launch", () => {
    const r = decodeFeeSplit([
      { kind: "PURE", pure: "AJQ1dwAAAAA=" },
      { kind: "PURE", pure: "Adm6K6M8xuthMCzsVkEmyq4i+74Q9WR4nF5uXsoJQDcs" },
      { kind: "PURE", pure: "ARAnAAAAAAAA" },
    ]);
    expect(r).toEqual({ payees: ["0xd9ba2ba33cc6eb61302cec564126caae22fbbe10f564789c5e6e5eca0940372c"], bps: [10000] });
  });
  it("returns null when no split is present", () => {
    expect(decodeFeeSplit([{ kind: "PURE", pure: "AA==" }])).toBeNull();
  });
});
