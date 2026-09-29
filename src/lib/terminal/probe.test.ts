import { Transaction } from "@mysten/sui/transactions";
import { it } from "vitest";
it("probe", () => {
  const tx = new Transaction();
  tx.setSender("0x" + "1".repeat(64));
  tx.setGasPayment([{ objectId: "0x" + "a".repeat(64), version: "1", digest: "1".repeat(32) }]);
  const source = tx.objectRef({ objectId: "0x" + "c".repeat(64), version: "1", digest: "1".repeat(32) });
  const [payment] = tx.splitCoins(source, [tx.pure.u64(100000n)]);
  const position = tx.moveCall({
    target: `0x${"d".repeat(64)}::pool::buy`,
    typeArguments: [`0x${"c".repeat(64)}::test::TEST`, `0x${"e".repeat(64)}::usdc::USDC`],
    arguments: [
      tx.sharedObjectRef({ objectId: "0x" + "b".repeat(64), initialSharedVersion: "1", mutable: true }),
      payment!,
      tx.pure.u64(0),
      tx.pure.u64(BigInt(Date.now())),
    ],
  });
  tx.transferObjects([position], "0x" + "1".repeat(64));
  console.log(JSON.stringify(tx.getData().commands).slice(0, 200));
});
