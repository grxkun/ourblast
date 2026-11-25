// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it, vi } from "vitest";
import { ensureBlastV2Currency, findBlastV2Currency } from "./blastV2-launch.server";

const { gql } = vi.hoisted(() => ({ gql: vi.fn() }));
vi.mock("./suipump-launch.server", () => ({
  gql,
  normalizeType: (type: string) => type.replace(/0x0+([0-9a-f])/g, "0x$1"),
}));
const coinType = "0xfcf357ee138d937e5a51a870932dae6a522219e1d77996e3665c2d8bbe91be27::evan::EVAN";
const sharedId = "0x9edb0d40796dd6e01159cf664546afcdaaf9c392c08d21b623e08c563349517a";

describe("Blast v2 Currency registration", () => {
  it("uses the exact shared Currency rather than the deleted receiving object", async () => {
    const type = `0x2::coin_registry::Currency<${coinType}>`;
    gql.mockResolvedValue({ objects: { nodes: [
      { address: "0xreceiving", owner: { __typename: "AddressOwner" }, asMoveObject: { contents: { type: { repr: type } } } },
      { address: sharedId, owner: { __typename: "Shared" }, asMoveObject: { contents: { type: { repr: type.replace("0x2::", `0x${"0".repeat(63)}2::`) } } } },
    ] } });
    expect(await findBlastV2Currency(coinType)).toBe(sharedId);
    expect(gql).toHaveBeenLastCalledWith(expect.any(String), { t: type });
  });
  it("skips registration when already finalized", async () => {
    const register = vi.fn();
    expect(await ensureBlastV2Currency({ lookup: vi.fn().mockResolvedValue(sharedId), register, wait: vi.fn() })).toBe(sharedId);
    expect(register).not.toHaveBeenCalled();
  });
  it("accepts another actor winning the race without replaying registration", async () => {
    const register = vi.fn().mockRejectedValue(new Error("receive_impl abort code: 3"));
    const lookup = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue(sharedId);
    expect(await ensureBlastV2Currency({ lookup, register, wait: vi.fn() })).toBe(sharedId);
    expect(register).toHaveBeenCalledTimes(1);
  });
  it("resolves the replacement ID after our own registration", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const lookup = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(sharedId);
    expect(await ensureBlastV2Currency({ lookup, register, wait: vi.fn() })).toBe(sharedId);
    expect(register).toHaveBeenCalledTimes(1);
  });
  it("stops when registration fails and no shared object exists", async () => {
    const register = vi.fn().mockRejectedValue(new Error("registration failed"));
    await expect(ensureBlastV2Currency({ lookup: vi.fn().mockResolvedValue(null), register, wait: vi.fn() })).rejects.toThrow("registration failed");
    expect(register).toHaveBeenCalledTimes(1);
  });
  it("does not treat a missing shared Currency as a completed registration", async () => {
    await expect(ensureBlastV2Currency({ lookup: vi.fn().mockResolvedValue(null), register: vi.fn(), wait: vi.fn() })).rejects.toThrow("curve opening stopped");
  });
});