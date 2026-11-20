// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it, vi } from "vitest";
vi.mock("./suipump-launch.server", () => ({
  rpc: vi.fn(),
  sharedRef: async (objectId: string) => ({ objectId, initialSharedVersion: "1" }),
}));
import { buildLaunchpadBuySwap, buildLaunchpadSellSwap } from "./launchpad-buy.server";
import { buildPresaleCommit } from "./bank-wallet.server";

const sender = "0x" + "a".repeat(64);
const plan = { pad: "blastv2" as const, coinType: "0x3::token::TOKEN", poolObjectId: "0x4" };
const pkg = "0x9c2cef371c0e80648136f7ae65378ac9476e3fdb860538d00290e6e4f975b192";
const version = "0x25b905a97e1c4e66be7b332e0d4e4b37a423f7cfb1dbdbe6e088e561df7d0ee3";
const runtime = "0xc0b25b6adc2186c116d5bfa6442194c6cdb09eecc6c6907e98c737662b2c97f1";

describe("Blast.fun production transactions", () => {
  it("buys through the production package and its shared config", async () => {
    const built = await buildLaunchpadBuySwap(sender, plan, 100_000_000n, 123n);
    expect(built).not.toBeNull();
    const data = built?.tx.getData();
    const call = data?.commands.find((c) => c.$kind === "MoveCall")?.MoveCall;
    expect(call?.package).toBe(pkg);
    expect(call?.function).toBe("buy");
    expect(JSON.stringify(data?.inputs)).toContain(version);
    expect(JSON.stringify(data?.inputs)).toContain(runtime);
    expect(call?.arguments).toHaveLength(5);
  });
  it("sells through the production package and its shared config", async () => {
    const built = await buildLaunchpadSellSwap(sender, plan, 100n, 1n);
    const data = built?.tx.getData();
    const call = data?.commands.find((c) => c.$kind === "MoveCall")?.MoveCall;
    expect(call?.package).toBe(pkg);
    expect(call?.function).toBe("sell");
    expect(JSON.stringify(data?.inputs)).toContain(version);
    expect(JSON.stringify(data?.inputs)).toContain(runtime);
    expect(call?.arguments).toHaveLength(5);
  });
  it("commits with the production presale version and returns the unused coin", () => {
    const tx = buildPresaleCommit(sender, { pkg: "0x1f44a8e9fab4380228fe9c1bcc27d99b7f6ea76a8e18b5c178ca18cd46fb33c4", presaleId: "0x5", memeType: plan.coinType, amount: 1_000_000_000n });
    const data = tx.getData();
    const call = data.commands.find((c) => c.$kind === "MoveCall")?.MoveCall;
    expect(call?.package).toBe("0x1f44a8e9fab4380228fe9c1bcc27d99b7f6ea76a8e18b5c178ca18cd46fb33c4");
    expect(call?.function).toBe("commit_open");
    expect(call?.arguments).toHaveLength(4);
    expect(JSON.stringify(data.inputs)).toContain("0xd9523cb850fac1d2ac84a31dbc1335e412e1b778d409b091c5eefec3f6133ba7");
    expect(data.commands.at(-1)?.$kind).toBe("TransferObjects");
  });
});