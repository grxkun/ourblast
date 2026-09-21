import { describe, expect, it } from "vitest";
import { parseDeployTweet } from "@/lib/terminal/xLauncher";
import { parseTerminalCommand } from "@/lib/terminal/commandParser";
import { matchLaunchpad } from "@/lib/terminal/launchpad";

describe("typo-tolerant pad matching", () => {
  it("resolves Peropelxity to perpsplexity", () => {
    expect(matchLaunchpad("Peropelxity")?.id).toBe("perpsplexity");
  });
  it("rejects non-pad chatter", () => {
    expect(matchLaunchpad("monday")).toBeNull();
    expect(matchLaunchpad("sui")).toBeNull();
  });
  it("tweet with typo pad does NOT fall back to suipump", () => {
    const req = parseDeployTweet("Deploy $TETY Tety Yety Caty on Peropelxity @Ourblastbot");
    expect(req?.launchpad).toBe("perpsplexity");
  });
  it("terminal command with typo pad resolves to perpsplexity", () => {
    const intent = parseTerminalCommand("launch $TETY Tety Yety Caty on Peropelxity");
    expect(intent.name).toBe("launchToken");
    expect(intent.input["launchpad"]).toBe("perpsplexity");
  });
  it("plain mentions still default to suipump", () => {
    expect(parseDeployTweet("Deploy $DOG Sui Dog @Ourblastbot")?.launchpad).toBe("suipump");
  });
});

describe("field-style tweet without a cashtag", () => {
  it("derives the ticker from Name: and keeps the perps position", () => {
    const req = parseDeployTweet("@Ourblastbot deploy a token on Perpsplexity . Name: Monerochan, Underlying is XMR, position LONG, leverage 5X https://t.co/Y0lqv8r5RS");
    expect(req?.launchpad).toBe("perpsplexity");
    expect(req?.symbol).toBe("MONEROCHAN");
    expect(req?.name).toBe("Monerochan");
    expect(req?.perps?.underlying).toBe("XMR");
    expect(req?.perps?.long).toBe(true);
    expect(req?.perps?.leverageBps).toBe(50_000);
  });
});
