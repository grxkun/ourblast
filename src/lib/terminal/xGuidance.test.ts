import { describe, expect, it } from "vitest";
import { guidanceTopic, nearMissGuidance } from "./x-guidance";

describe("near-miss guidance", () => {
  it("guides an incomplete launch attempt", () => {
    const reply = nearMissGuidance("@ourblastbot launch $COOL");
    expect(reply).toContain("launch $TICKER Token Name");
    expect(reply!.length).toBeLessThanOrEqual(280);
  });

  it("recognises a leveraged ask as perps", () => {
    expect(guidanceTopic("can u do 3x long nvda coin")).toBe("perps");
    expect(nearMissGuidance("perps launch pls")).toContain("Perpsplexity");
  });

  it("guides fee and transfer asks", () => {
    expect(guidanceTopic("claim my fees pls")).toBe("claim");
    expect(guidanceTopic("transfer some sui to my mate")).toBe("send");
  });

  it("answers questions with the help template", () => {
    expect(guidanceTopic("what can you do?")).toBe("help");
    expect(guidanceTopic("@Ourblastbot tell me what you can do!")).toBe("help");
    expect(guidanceTopic("what do u do")).toBe("help");
    const reply = nearMissGuidance("@Ourblastbot tell me what you can do!")!;
    expect(reply).toContain("Launch tokens");
    expect(reply.length).toBeLessThanOrEqual(280);
  });

  it("stays silent on casual tags and spam", () => {
    expect(nearMissGuidance("gm")).toBeNull();
    expect(nearMissGuidance("@ourblastbot lol")).toBeNull();
    expect(nearMissGuidance("lfg ser 🚀")).toBeNull();
  });

  it("never posts two cashtags", () => {
    for (const text of ["launch a coin", "claim my fees", "buy this", "how does this work?"]) {
      const reply = nearMissGuidance(text) ?? "";
      expect((reply.match(/\$[A-Za-z]/g) ?? []).length).toBeLessThanOrEqual(1);
    }
  });
});
