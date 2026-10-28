// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it, vi } from "vitest";
import { telegramRecipientCommand } from "./recipient";

const address = `0x${"9".repeat(64)}`;
describe("Telegram platform recipient rules", () => {
  it("treats @block_avenger as Telegram, independent of linked X identity", async () => {
    const resolve = vi.fn().mockResolvedValue(address);
    expect(await telegramRecipientCommand("send 100 HOLMOT to @block_avenger", resolve))
      .toEqual({ ok: true, text: `send 100 HOLMOT to ${address}` });
    expect(resolve).toHaveBeenCalledWith("block_avenger");
  });
  it("refuses unknown Telegram users instead of allowing an X send or gift buy", async () => {
    const result = await telegramRecipientCommand("buy 1 sui of HOLMOT then send it to @Grxxxkun", async () => null);
    expect(result.ok).toBe(false);
  });
  it("preserves direct addresses and SuiNS without Telegram lookups", async () => {
    const resolve = vi.fn();
    for (const target of [address, "adeniyi.sui"]) {
      const text = `send 100 HOLMOT to ${target}`;
      expect(await telegramRecipientCommand(text, resolve)).toEqual({ ok: true, text });
    }
    expect(resolve).not.toHaveBeenCalled();
  });
  it("supports Telegram usernames longer than the X limit for NFT and multi-token sends", async () => {
    for (const text of ["send nft 0x123 to @long_telegram_username", "send 100 HOLMOT, 1 SUI to @long_telegram_username"]) {
      expect(await telegramRecipientCommand(text, async () => address))
        .toEqual({ ok: true, text: text.replace("@long_telegram_username", address) });
    }
  });
});