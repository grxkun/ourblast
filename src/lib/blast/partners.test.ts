import { describe, expect, it } from "vitest";
import { inForce, partnerCut, pendingChange, buildMintPartnerCap, BLAST_PARTNERS_PKG, productionTimedValue } from "./partners";

describe("blast partners", () => {
  it("keeps production pending values pending until applied on-chain", () => {
    expect(productionTimedValue({ value: "2000", pending: null })).toEqual({ current: "2000", pending: null });
    const state = { value: "2000", pending: { value: "4000", ready_at_ms: "1000" } };
    expect(productionTimedValue(state)).toEqual({ current: "2000", pending: "4000" });
  });
  it("takes floor(fee × share / 10,000) — 40% of 2,000 USDC is 800", () => {
    expect(partnerCut(2_000_000_000n, 4_000)).toBe(800_000_000n);
    expect(partnerCut(15n, 4_000)).toBe(6n);
    expect(partnerCut(3n, 4_000)).toBe(1n);
  });
  it("never pays above 80%", () => expect(partnerCut(100n, 9_000)).toBe(80n));
  it("applies the timelock", () => {
    const t = { before: "4000", after: "2000", at_ms: 1_000 };
    expect(inForce(t, 999)).toBe("4000");
    expect(pendingChange(t, 999)).toBe("2000");
    expect(inForce(t, 1_000)).toBe("2000");
    expect(pendingChange(t, 1_000)).toBeNull();
  });
  it("mints the cap to the owner", () => {
    const owner = "0x" + "a".repeat(64);
    const data = buildMintPartnerCap(owner).getData();
    expect(JSON.stringify(data.commands)).toContain("new_cap");
    expect(JSON.stringify(data.commands)).toContain(BLAST_PARTNERS_PKG.slice(2, 20));
  });
});

describe("partner package", () => {
  it("mints caps from the live Blast partners package", () => {
    expect(BLAST_PARTNERS_PKG).toBe("0x2998c10c91e46082548b2f3205f84f09377bbbedf2b0f617f70575a09ec69a54");
  });
});
