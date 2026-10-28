import { describe, it, expect } from "vitest";
import { tgNativeHandle } from "./tgIdentity.server";

describe("native Telegram wallet handle", () => {
  it("keys by numeric Telegram ID with a hyphen X handles can't contain", () => {
    expect(tgNativeHandle(987654321)).toBe("tg-987654321");
    expect(/^[a-z0-9_]{1,15}$/i.test(tgNativeHandle(1))).toBe(false);
  });
});
