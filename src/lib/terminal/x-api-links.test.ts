// SPDX-License-Identifier: BUSL-1.1
import { afterEach, describe, expect, it, vi } from "vitest";
import { expandTweetText, fetchTweetDetails, listMentions, searchMentions } from "./x-api.server";
import { parseDeployTweet } from "./xLauncher";

const credentials = { apiKey: "test", apiSecret: "test", accessToken: "test", accessSecret: "test" };
const tweet = {
  id: "2125383911450812627",
  text: "@ourblastbot launch $ALPHA Alpha Dog on https://t.co/Z2iDCmNGJY",
  author_id: "user",
  entities: { urls: [{ url: "https://t.co/Z2iDCmNGJY", expanded_url: "https://blast.fun" }] },
};

afterEach(() => vi.unstubAllGlobals());

describe("X shortened launchpad URLs", () => {
  for (const path of ["timeline", "search", "direct"] as const) {
    it(`${path} routes the ALPHA tweet to Blast.fun, not default Suipump`, async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        data: path === "direct" ? tweet : [tweet],
        includes: { users: [{ id: "user", username: "Grxxxkun" }] },
      }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      const item = path === "direct"
        ? await fetchTweetDetails(credentials, tweet.id)
        : (path === "timeline"
          ? await listMentions(credentials, "bot")
          : await searchMentions(credentials, "ourblastbot"))[0];
      expect(item).toBeDefined();
      expect(parseDeployTweet(item?.text ?? "", "suipump")).toMatchObject({
        symbol: "ALPHA", name: "Alpha Dog", launchpad: "blastfun",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
      expect(new URL(requestUrl).searchParams.get("tweet.fields")?.split(",")).toContain("entities");
    });
  }

  it.each(["blast.fun", "https://blast.fun", "https://www.blast.fun/", "@blastfun"])(
    "recognizes explicit pad %s and excludes it from the name", (pad) => {
      expect(parseDeployTweet(`@ourblastbot launch $ALPHA Alpha Dog on ${pad}`)).toMatchObject({
        name: "Alpha Dog", launchpad: "blastfun",
      });
    },
  );

  it("keeps default Suipump when no launchpad is requested", () => {
    expect(parseDeployTweet("@ourblastbot launch $ALPHA Alpha Dog")).toMatchObject({
      name: "Alpha Dog", launchpad: "suipump",
    });
  });

  it("does not replace prefixes or unknown short links", () => {
    expect(expandTweetText({ ...tweet, text: "https://t.co/Z2iDCmNGJYextra https://t.co/unknown" }))
      .toBe("https://t.co/Z2iDCmNGJYextra https://t.co/unknown");
  });

  it("preserves plain text when X supplies no URL entities", () => {
    expect(expandTweetText({ text: "launch $ALPHA Alpha Dog on blast.fun" }))
      .toBe("launch $ALPHA Alpha Dog on blast.fun");
  });
});