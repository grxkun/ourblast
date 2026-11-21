import { describe, expect, it } from "vitest";
import { parsePnlBg, resolvePnlBg, PNL_PRESETS } from "./pnlCard";
describe("pnl background", () => {
  it("parses preset, url, reset", () => {
    expect(parsePnlBg("/pnlbg cool")).toEqual({ set: "cool" });
    expect(parsePnlBg("/pnlbg https://i.imgur.com/a.jpg")).toEqual({ set: "https://i.imgur.com/a.jpg" });
    expect(parsePnlBg("/pnlbg reset")).toEqual({ reset: true });
    expect(parsePnlBg("/settings")).toEqual({ menu: true });
  });
  it("rejects non-https custom urls", () => {
    expect(resolvePnlBg("http://x.com/a.jpg")).toBe(PNL_PRESETS["blast"]!.url);
  });
});
