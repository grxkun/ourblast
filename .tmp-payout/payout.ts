import { Transaction } from "@mysten/sui/transactions";
import { gasCoins, loadDeployer, referenceGasPrice, rpc, withGas, signAndExecute } from "/dev-server/src/lib/terminal/suipump-launch.server";
import { splitAmounts } from "/dev-server/src/lib/terminal/popular-claim.server";
import { FOUNDER_ADDRESS, DEFAULT_TREASURY_ADDRESS } from "/dev-server/src/lib/ourblast.config";
import { PERPSPLEXITY_QUOTE_TYPE } from "/dev-server/src/lib/terminal/perpsplexity";

const SEND = process.argv[2] === "send";
const total = 21_884_676n;
const willie = "0xcf5ae04ec11df4259694db926e179df7bcf9b0db03045bfe0b97e87d42de0c93";
const payees = [FOUNDER_ADDRESS.toLowerCase(), DEFAULT_TREASURY_ADDRESS.toLowerCase(), willie];
const amounts = splitAmounts(total, [1000, 1000, 8000]);
const kp = (await loadDeployer())!;
const bot = kp.getPublicKey().toSuiAddress();
const coins = (await rpc<any>("suix_getCoins", [bot, PERPSPLEXITY_QUOTE_TYPE, null, 50])).data;
const [gas, gp] = await Promise.all([gasCoins(bot), referenceGasPrice()]);
const tx = new Transaction();
withGas(tx, bot, gas, gp, 20_000_000);
const [p, ...rest] = coins.map((c: any) => tx.object(c.coinObjectId));
if (rest.length) tx.mergeCoins(p, rest);
const parts = tx.splitCoins(p, amounts.map((a) => tx.pure.u64(a)));
payees.forEach((a, i) => tx.transferObjects([parts[i]!], a));
console.log(payees, amounts.map(String));
if (!SEND) {
  const bytes = await tx.build({ client: { getRpcApiVersion: async () => "1" } as any }).catch(() => null);
  const { SuiClient } = await import("@mysten/sui/client");
  const c = new SuiClient({ url: "https://rpc-mainnet.suiscan.xyz" });
  const b = await tx.build({ client: c });
  const r = await c.dryRunTransactionBlock({ transactionBlock: b });
  console.log("dry", r.effects.status, r.balanceChanges.map((x) => [x.owner, x.coinType.slice(-10), x.amount]));
} else {
  console.log(await signAndExecute(tx, kp));
}
