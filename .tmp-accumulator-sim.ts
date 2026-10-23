// One-off read-only simulation: send 1000 ONE (held only as an address
// balance) from YoBooogie's OurBank wallet. Nothing is signed or broadcast.
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { Transaction } from "@mysten/sui/transactions";

import { tokenSendSource } from "./src/lib/terminal/bank-wallet.server";
import { readAddressBalance, readSuiHoldings } from "./src/lib/terminal/sui-balances.server";
import { suiCompatCall } from "./src/lib/terminal/sui-rpc-compat.server";

const SENDER = "0x656775fdc913eaac6dbf3b266b6d43b0d3b713e91aab9d4998012ace44a46c2b";
const TO = "0x9bd0e5e23f68cbb29242cd56a36164ba05162910192da36215e6a8c87e5870bf";

const holdings = await readSuiHoldings(SENDER);
const one = holdings.find((h) => h.symbol === "SUIPUMP" || h.coinType.includes("suipump"));
if (!one) throw new Error("ONE holding not found");
console.log("ONE type:", one.coinType, "total:", one.balance.toString());
console.log("ONE addressBalance:", (await readAddressBalance(SENDER, one.coinType)).toString());

const gasPage = await suiCompatCall<{ data: { coinObjectId: string; version: string; digest: string; balance: string }[] }>(
  "suix_getCoins", [SENDER, "0x2::sui::SUI", null, 5],
);
const gas = gasPage.data[0];
if (!gas) throw new Error("no gas coin");
console.log("gas coin:", gas.coinObjectId, "balance:", gas.balance);

const tx = new Transaction();
tx.setSender(SENDER);
tx.setGasPayment([{ objectId: gas.coinObjectId, version: gas.version, digest: gas.digest }]);
tx.setGasPrice(1000n);
tx.setGasBudget(10_000_000n);

const source = await tokenSendSource(tx, SENDER, one.coinType, 1_000_000_000n, {
  getCoins: async (owner, t) =>
    (await suiCompatCall<{ data: { coinObjectId: string; version: string; digest: string; balance: string }[] }>(
      "suix_getCoins", [owner, t, null, 50],
    )).data ?? [],
  addressBalance: readAddressBalance,
});
if ("error" in source) throw new Error(source.error);
tx.transferObjects([source.coin], tx.pure.address(TO));

const client = new SuiGraphQLClient({ url: "https://graphql.mainnet.sui.io/graphql", network: "mainnet" });
const bytes = await tx.build({ client });
const sim = await client.core.simulateTransaction({ transaction: bytes });
const status = sim.$kind === "Transaction" ? sim.Transaction?.status : (sim as { status?: unknown }).status;
console.log("simulation status:", JSON.stringify(status));
const err = (sim as { Transaction?: { effects?: { status?: { error?: string } } } }).Transaction?.effects?.status?.error;
if (err) console.log("simulation error:", err);
