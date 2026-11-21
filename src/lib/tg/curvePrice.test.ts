import { describe, expect, it } from "vitest";
import { b64Address, blastSpotSui, curveProgress } from "./curvePrice";
describe("bonding curve price", () => {
  it("Blast spot = (virtual + real) / meme reserve", () => {
    const p = blastSpotSui({ virtualQuote: 1_000_000_000_000n, realQuote: 1_477_500_000n, memeReserve: 781_145_856_996_287_985n }, 9)!;
    expect(p).toBeCloseTo(1001.4775 / 781_145_856.996, 12);
  });
  it("progress caps at 100%", () => expect(curveProgress(2n, 1n)).toBe(1));
  it("decodes base64 creator", () => expect(b64Address("m9IP+1A5Ed5xiPuuGTwvY/P/CnfXoZvs///jx5h9y2E=")).toBe("0x9bd20ffb503911de7188fbae193c2f63f3ff0a77d7a19becffffe3c7987dcb61"));
});
