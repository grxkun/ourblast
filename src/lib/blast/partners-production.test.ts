// SPDX-License-Identifier: BUSL-1.1
import { afterEach, describe, expect, it, vi } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
vi.mock("@/lib/terminal/suipump-launch.server", () => ({ sharedRef: async (objectId: string) => ({ objectId, initialSharedVersion: "1" }) }));
import { attachPartner, buildPartnerFeeClaim } from "./partners.server";
afterEach(() => vi.unstubAllEnvs());

describe("production partner transaction signatures", () => {
  it("claims using the production treasury with four explicit arguments", async () => {
    vi.stubEnv("BLAST_PARTNER_ID", "0x" + "a".repeat(64));
    const tx = await buildPartnerFeeClaim("0x1", "0x2", "0x3::token::TOKEN", "0x2::sui::SUI");
    const data = tx?.getData();
    const call = data?.commands.find(c => c.$kind === "MoveCall")?.MoveCall;
    expect(call?.package).toBe("0x9c2cef371c0e80648136f7ae65378ac9476e3fdb860538d00290e6e4f975b192");
    expect(call?.function).toBe("claim_protocol_fees_with_partner");
    expect(call?.arguments).toHaveLength(4);
    expect(JSON.stringify(data?.inputs)).toContain("0x11f54f5cabdf5f1add9b05d54229dee53a16f698e08016aae8a6068b9f281b7e");
  });
  it("leaves launches untouched when a shared partner ID is not configured", async () => {
    vi.stubEnv("BLAST_PARTNER_ID", "");
    const tx = new Transaction();
    expect(await attachPartner(tx, tx.object("0x2"), "0x3::token::TOKEN", "0x2::sui::SUI")).toBe(false);
    expect(tx.getData().commands).toHaveLength(0);
    expect(await buildPartnerFeeClaim("0x1", "0x2", "0x3::token::TOKEN", "0x2::sui::SUI")).toBeNull();
  });
});