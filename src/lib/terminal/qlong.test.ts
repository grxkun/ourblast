import {test,expect} from "vitest";
import {parseDeployTweet,extractDescription} from "./xLauncher";
const t="@Ourblastbot \nLaunch on Perpsplexity\nTicker $QLONG\nName  Qinglong\nUnderlying BYD\nPosition Long\nLeverage 2x\nDev buy 400 USDC\nDescription  The Tesla killer grows stronger";
test("q",()=>{const r=parseDeployTweet(t);console.log(r?.name,r?.symbol,r?.perps,r?.devBuyUsdc);expect(r?.name).toBe("Qinglong");expect(extractDescription(t)).toBe("The Tesla killer grows stronger");});
