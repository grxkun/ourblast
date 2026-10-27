import { describe, expect, it } from "vitest";
import { buyDeepLink, findScanTarget, parseStartBuy } from "./scanner";

const CT = "0x6055e3a3decac47b3934f1baf358fb799f1d6483b55d279dadad029286da583e::qlong::QLONG";

describe("group scanner", () => {
  it("detects a contract pasted inside a sentence", () => {
    expect(findScanTarget(`ape this ${CT} now`)).toEqual({ symbol: "QLONG", coinType: CT });
  });
  it("/scan with a contract", () => {
    expect(findScanTarget(`/scan@ourblastsuibot ${CT}`)?.coinType).toBe(CT);
  });
  it("ignores normal chat", () => {
    expect(findScanTarget("gm everyone")).toBeNull();
  });
  it("deep link round-trips the ticker", () => {
    expect(parseStartBuy(`/start ${buyDeepLink("QLONG").split("start=")[1]}`)).toBe("QLONG");
  });
});
