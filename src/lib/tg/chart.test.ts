import { describe, expect, it } from "vitest";
import { parseChartCmd } from "./chart";
describe("parseChartCmd", () => {
  it("defaults to 15m", () => expect(parseChartCmd("/chart $BLAST")).toEqual({ target: "$BLAST", tf: "15m" }));
  it("reads timeframe", () => expect(parseChartCmd("/c@ourblastsuibot 0x1::a::A 4h")).toEqual({ target: "0x1::a::A", tf: "4h" }));
  it("timeframe first", () => expect(parseChartCmd("/chart 1h $BLAST")).toEqual({ target: "$BLAST", tf: "1h" }));
  it("bad tf falls back", () => expect(parseChartCmd("/chart $BLAST 7x")?.tf).toBe("15m"));
  it("not other commands", () => expect(parseChartCmd("/claim x")).toBeNull());
});
