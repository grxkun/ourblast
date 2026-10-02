import { describe, expect, it } from "vitest";

import {
  OURBLAST_LAUNCH_FEE_MIST,
  formatSui,
  launchFeeMist,
  lowBalanceNotice,
  noWalletNotice,
  requiredBalanceMist,
} from "./launchFee";

describe("X launch fee", () => {
  it("charges only the 1 SUI OurBlast fee where the launchpad charges nothing", () => {
    expect(launchFeeMist("maelstrom")).toBe(OURBLAST_LAUNCH_FEE_MIST);
    expect(launchFeeMist("blastfun")).toBe(1_000_000_000n);
  });

  it("adds each launchpad's own on-chain fee so the bot never pays it", () => {
    expect(launchFeeMist("suipump")).toBe(3_000_000_000n);
    expect(launchFeeMist("popular")).toBe(2_000_000_000n);
    expect(launchFeeMist("ript")).toBe(2_000_000_000n);
    expect(launchFeeMist("perpsplexity")).toBe(6_000_000_000n);
  });

  it("requires the fee plus gas headroom in the OurBank wallet", () => {
    expect(requiredBalanceMist("suipump")).toBe(7_000_000_000n);
    expect(requiredBalanceMist("popular")).toBe(6_000_000_000n);
    expect(requiredBalanceMist("maelstrom")).toBe(5_000_000_000n);
    expect(requiredBalanceMist("perpsplexity")).toBe(10_000_000_000n);
  });

  it("names the shortfall in plain SUI", () => {
    const notice = lowBalanceNotice("suipump", 2_500_000_000n);
    expect(notice).toContain("2.5 SUI");
    expect(notice).toContain("7 SUI");
    expect(notice).toContain("ourblast.xyz/terminal");
  });

  it("formats mist without trailing zeros", () => {
    expect(formatSui(1_000_000_000n)).toBe("1");
    expect(formatSui(1_234_500_000n)).toBe("1.2345");
  });

  it("points terminal callers at the terminal wallet card, not their X account", () => {
    expect(noWalletNotice(true)).toContain("OurBank card in the terminal");
    expect(noWalletNotice(false)).toContain("linked to your X account");
  });
});
