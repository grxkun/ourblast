import { useServerFn } from "@tanstack/react-start";
import { useCallback } from "react";

import { useBlast } from "@/components/blast/session";
import { confirmOwnSwap, confirmTransfer, prepareOwnSwap, prepareTransfer } from "@/lib/terminal/bank.functions";

/** Signs OurBank requests with the user's own connected wallet, then lets the server check the chain. */
export function useBankApprovals() {
  const { signAndExecute } = useBlast();
  const prepSwap = useServerFn(prepareOwnSwap);
  const confSwap = useServerFn(confirmOwnSwap);
  const prepTransfer = useServerFn(prepareTransfer);
  const confTransfer = useServerFn(confirmTransfer);

  const approveSwap = useCallback(
    async (id: string) => {
      const plan = await prepSwap({ data: { id } });
      const { digest } = await signAndExecute(async () => {
        const { Transaction } = await import("@mysten/sui/transactions");
        const bytes = Uint8Array.from(atob(plan.bytes), (c) => c.charCodeAt(0));
        return Transaction.from(bytes);
      });
      const result = await confSwap({ data: { id, digest } });
      return { ...result, venue: plan.venue };
    },
    [prepSwap, confSwap, signAndExecute],
  );

  const approveTransfer = useCallback(
    async (id: string) => {
      const plan = await prepTransfer({ data: { id } });
      const { digest } = await signAndExecute(async (tx) => {
        const { coinWithBalance } = await import("@mysten/sui/transactions");
        const coin = coinWithBalance({ type: plan.coinType, balance: BigInt(plan.amountAtomic) });
        tx.transferObjects([coin], tx.pure.address(plan.recipient));
      });
      const result = await confTransfer({ data: { id, digest } });
      return { ...result, digest };
    },
    [prepTransfer, confTransfer, signAndExecute],
  );

  return { approveSwap, approveTransfer };
}
