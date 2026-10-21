// SPDX-License-Identifier: BUSL-1.1
import { describe, expect, it } from "vitest";
import { describeActivity, parseFollowCommand } from "./walletWatch";

const A = `0x${"a".repeat(64)}`;
const T = "0xabc::grok::GROK";
describe("wallet watch", () => {
  it("parses follow with label and normalizes address", () => {
    expect(parseFollowCommand(`/follow 0x${"A".repeat(64)} dev`)).toEqual({ op: "follow", address: A, label: "dev" });
    expect(parseFollowCommand(`unfollow ${A}`)).toEqual({ op: "unfollow", address: A });
    expect(parseFollowCommand("/following")).toEqual({ op: "list" });
    expect(parseFollowCommand("follow me")).toBeNull();
  });
  it("labels buys and sells from real balance changes", () => {
    expect(describeActivity(A, [{ owner: A, coinType: "0x2::sui::SUI", amount: "-5000000000" }, { owner: A, coinType: T, amount: "100" }], [])).toMatch(/^🟢 Bought \$GROK for 5 SUI/);
    expect(describeActivity(A, [{ owner: A, coinType: "0x2::sui::SUI", amount: "2000000000" }, { owner: A, coinType: T, amount: "-100" }], [])).toMatch(/^🔴 Sold \$GROK for 2 SUI/);
    expect(describeActivity(A, [], ["0xpkg"])).toMatch(/^🚀/);
  });
});
