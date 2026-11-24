// SPDX-License-Identifier: BUSL-1.1
import type { Transaction } from "@mysten/sui/transactions";

/** Let the official SDK include address-balance reservations in gas smashing. */
export function withBankGas(tx: Transaction, sender: string, gasPrice: number, budget: bigint): void {
  tx.setSender(sender);
  tx.setGasPrice(gasPrice);
  tx.setGasBudget(budget);
  // Do not pin Coin<SUI> objects: SUI coin intents may spend more than those
  // objects hold, and the SDK must add the accumulator's reservation as well.
}