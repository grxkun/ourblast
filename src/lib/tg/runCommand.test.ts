// SPDX-License-Identifier: BUSL-1.1
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runTgCommand } from "./runCommand.server";

const m = vi.hoisted(() => ({
  recipient: vi.fn(), bank: vi.fn(async () => "confirmed mock receipt"),
  wallet: vi.fn(async () => ({ address: `0x${"1".repeat(64)}` })),
}));
vi.mock("./tgIdentity.server", () => ({ tgRecipientAddress: m.recipient, tgWalletHandle: async () => "sender_x" }));
vi.mock("./multiWallet", () => ({ parseWalletCommand: () => null, parseWalletPrefix: () => null, isFanOutTrade: () => false }));
vi.mock("./limitOrder", () => ({ parseLimitCommand: () => null }));
vi.mock("./chatTrade", () => ({ parseSnipeCommand: () => null, actionCommand: vi.fn() }));
vi.mock("@/lib/terminal/bank-wallet.server", () => ({ ensureBankWallet: m.wallet }));
vi.mock("@/lib/terminal/bank.server", () => ({ handleBankMention: m.bank }));
vi.mock("@/lib/terminal/xClaim.server", () => ({
  handleClaimLinkMention: async () => null, handleFeeCheckMention: async () => null, handleFeeClaimMention: async () => null,
}));
beforeEach(() => vi.clearAllMocks());
describe("Telegram shared command execution", () => {
  it("passes a Telegram-resolved address, not an X handle, into the send engine", async () => {
    const address = `0x${"9".repeat(64)}`;
    m.recipient.mockResolvedValue(address);
    const result = await runTgCommand(123, "send 100 HOLMOT to @block_avenger", "Crypt_willie1");
    expect(result.reply).toBe("confirmed mock receipt");
    expect(m.bank).toHaveBeenCalledWith(expect.stringMatching(/^terminal-tg-/), "Crypt_willie1", `send 100 HOLMOT to ${address}`);
  });
  it("blocks buy-and-send before executing any trade if Telegram lookup fails", async () => {
    m.recipient.mockResolvedValue(null);
    await runTgCommand(123, "buy 1 sui of HOLMOT then send it to @Grxxxkun", "Crypt_willie1", { mainOnly: true });
    expect(m.bank).not.toHaveBeenCalled();
    expect(m.wallet).not.toHaveBeenCalled();
  });
});