import { describe, expect, it } from "vitest";
import { buildTradeCommand } from "./tradeCommand";
describe("buildTradeCommand", () => {
  it("buy spends SUI", () => expect(buildTradeCommand("buy", "$blast", "1.5")).toBe("buy 1.5 sui of $BLAST"));
  it("sell uses percent", () => expect(buildTradeCommand("sell", "CZ", "100")).toBe("sell 100% $CZ"));
  it("rejects sell over 100%", () => expect(buildTradeCommand("sell", "CZ", "150")).toBeNull());
  it("rejects zero buy", () => expect(buildTradeCommand("buy", "CZ", "0")).toBeNull());
});
