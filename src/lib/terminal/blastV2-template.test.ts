// SPDX-License-Identifier: BUSL-1.1
import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateBlastV2Symbol } from "./blastV2-launch.server";
import { resolveLaunchpad } from "./launchpad";
import { launchFeeMist } from "./launchFee";

describe("Blast.fun v2 launches", () => {
  it("Blast.fun is a live X launchpad", () => {
    expect(resolveLaunchpad("blast").integrated).toBe(true);
  });
  it("charges only the 1 SUI OurBlast fee", () => {
    expect(launchFeeMist("blastfun")).toBe(1_000_000_000n);
  });
  it("refuses reserved tickers", () => {
    expect(validateBlastV2Symbol("SUI", "Sui")).toBeNull();
    expect(validateBlastV2Symbol("BLAST", "x")).toBeNull();
    expect(validateBlastV2Symbol("pepe", "Pepe")).toBe("PEPE");
  });
  it.runIf(existsSync("/tmp/blast-launch/tpl.mv"))("patches the creator to a plain address", async () => {
    const { patchBlastV2Template } = await import("./blastV2-template.server");
    const tpl = new Uint8Array(readFileSync("/tmp/blast-launch/tpl.mv"));
    const out = patchBlastV2Template(tpl, { module: "blast", struct: "BLAST" }, {
      module: "pepe", struct: "PEPE", symbol: "PEPE", name: "Pepe", description: "d", iconUrl: "https://x.y/i.png",
      creator: "0x" + "ab".repeat(32),
    });
    const hex = Buffer.from(out).toString("hex");
    expect(hex).toContain("ab".repeat(32));
  });
});
