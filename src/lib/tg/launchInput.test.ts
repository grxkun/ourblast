// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { tgLaunchInput } from "./launchInput";
const base = { symbol: "TEST", name: "Test token", launchpad: "suipump", iconUrl: "https://ourblast.xyz/ourblast-icon.png", slot: 1, firstBuySui: 5 };
describe("Telegram launch input", () => {
  it("accepts a Suipump launch with a 5 SUI first buy", () => expect(tgLaunchInput.parse(base).firstBuySui).toBe(5));
  it("does not promise an unsupported Blast.fun first buy", () => expect(tgLaunchInput.safeParse({ ...base, launchpad: "blastfun" }).success).toBe(false));
  it("permits a launch-only Blast.fun request", () => expect(tgLaunchInput.safeParse({ ...base, launchpad: "blastfun", firstBuySui: 0 }).success).toBe(true));
  it("only accepts wallets W1–W6", () => expect(tgLaunchInput.safeParse({ ...base, slot: 7 }).success).toBe(false));
  it("refuses non-HTTPS icon URLs", () => expect(tgLaunchInput.safeParse({ ...base, iconUrl: "http://ourblast.xyz/icon.png" }).success).toBe(false));
});