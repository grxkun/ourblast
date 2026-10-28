import { describe, it, expect, vi, beforeEach } from "vitest";
import { tgNativeHandle, tgRecipientAddress } from "./tgIdentity.server";

const mocks = vi.hoisted(() => ({
  rows: [] as { tg_user_id: number; x_username: string | null }[],
  ilike: vi.fn(),
  ensure: vi.fn(async () => ({ address: `0x${"9".repeat(64)}` })),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: () => ({ select: () => ({ ilike: (...args: unknown[]) => {
    mocks.ilike(...args);
    return { limit: async () => ({ data: mocks.rows, error: null }) };
  } }) }),
} }));
vi.mock("@/lib/terminal/bank-wallet.server", () => ({ ensureBankWallet: mocks.ensure }));
beforeEach(() => { mocks.rows = []; vi.clearAllMocks(); });

describe("native Telegram wallet handle", () => {
  it("keys by numeric Telegram ID with a hyphen X handles can't contain", () => {
    expect(tgNativeHandle(987654321)).toBe("tg-987654321");
    expect(/^[a-z0-9_]{1,15}$/i.test(tgNativeHandle(1))).toBe(false);
  });
});

describe("canonical Telegram recipient", () => {
  it("uses Grxxxkun's linked main wallet for Telegram block_avenger", async () => {
    mocks.rows = [{ tg_user_id: 123, x_username: "Grxxxkun" }];
    expect(await tgRecipientAddress("block_avenger")).toBe(`0x${"9".repeat(64)}`);
    expect(mocks.ilike).toHaveBeenCalledWith("username", "block\\_avenger");
    expect(mocks.ensure).toHaveBeenCalledWith("Grxxxkun", null);
  });
  it("uses a numeric Telegram wallet when X is not linked", async () => {
    mocks.rows = [{ tg_user_id: 123, x_username: null }];
    await tgRecipientAddress("Crypt_willie1");
    expect(mocks.ensure).toHaveBeenCalledWith("tg-123", null);
  });
  it("never creates an X wallet for a missing Telegram user", async () => {
    expect(await tgRecipientAddress("Grxxxkun")).toBeNull();
    expect(mocks.ensure).not.toHaveBeenCalled();
  });
  it("refuses ambiguous Telegram usernames", async () => {
    mocks.rows = [{ tg_user_id: 1, x_username: "one" }, { tg_user_id: 2, x_username: "two" }];
    expect(await tgRecipientAddress("block_avenger")).toBeNull();
    expect(mocks.ensure).not.toHaveBeenCalled();
  });
});
