// SPDX-License-Identifier: BUSL-1.1
import { Transaction, type TransactionArgument } from "@mysten/sui/transactions";

/** Official Mysten kiosk rules package (royalty_rule, kiosk_lock_rule). */
export const KIOSK_RULES_PKG = "0x434b5bd8f6a7b05fede0ff46c6e511d71ea326ed38056e3bcd681d2d7c2a7879";
const ROYALTY = `${KIOSK_RULES_PKG}::royalty_rule::Rule`;
const LOCK = `${KIOSK_RULES_PKG}::kiosk_lock_rule::Rule`;
const SUPPORTED = new Set([ROYALTY, LOCK]);

const strip = (s: string) => s.toLowerCase().replace(/^0x0*/, "");

/** Returns an error when a policy has a rule we can't satisfy — never guess at unknown rules. */
export function unsupportedRules(rules: string[]): string[] {
  const ok = new Set([...SUPPORTED].map(strip));
  return rules.filter((r) => !ok.has(strip(r)));
}

export interface KioskItem { id: string; type: string; kioskId: string; capId: string; locked: boolean }
export interface KioskPolicy { id: string; rules: string[] }

/**
 * Moves kiosk items to `recipient` inside one transaction.
 * Unlocked items are taken out and transferred directly. Locked items are listed at 0 in the
 * sender's own kiosk, bought by the sender in the same tx, royalties paid, then locked into a
 * brand-new kiosk whose owner cap goes to the recipient — the only way the lock rule allows.
 */
export function addKioskTransfers(
  tx: Transaction,
  items: KioskItem[],
  policies: Map<string, KioskPolicy>,
  recipient: string,
): void {
  let newKiosk: TransactionArgument | null = null;
  let newCap: TransactionArgument | null = null;
  const direct: TransactionArgument[] = [];
  for (const it of items) {
    const kiosk = tx.object(it.kioskId);
    const cap = tx.object(it.capId);
    if (!it.locked) {
      direct.push(tx.moveCall({ target: "0x2::kiosk::take", typeArguments: [it.type], arguments: [kiosk, cap, tx.pure.id(it.id)] }));
      continue;
    }
    const policy = policies.get(it.type);
    if (!policy) throw new Error("No transfer policy for this collection.");
    if (!newKiosk) {
      const [k, c] = tx.moveCall({ target: "0x2::kiosk::new" });
      newKiosk = k!; newCap = c!;
    }
    const pol = tx.object(policy.id);
    tx.moveCall({ target: "0x2::kiosk::list", typeArguments: [it.type], arguments: [kiosk, cap, tx.pure.id(it.id), tx.pure.u64(0)] });
    const zero = tx.moveCall({ target: "0x2::coin::zero", typeArguments: ["0x2::sui::SUI"] });
    const [item, req] = tx.moveCall({ target: "0x2::kiosk::purchase", typeArguments: [it.type], arguments: [kiosk, tx.pure.id(it.id), zero] });
    const has = (r: string) => policy.rules.some((x) => strip(x) === strip(r));
    if (has(ROYALTY)) {
      const fee = tx.moveCall({ target: `${KIOSK_RULES_PKG}::royalty_rule::fee_amount`, typeArguments: [it.type], arguments: [pol, tx.pure.u64(0)] });
      const [pay] = tx.splitCoins(tx.gas, [fee]);
      tx.moveCall({ target: `${KIOSK_RULES_PKG}::royalty_rule::pay`, typeArguments: [it.type], arguments: [pol, req!, pay!] });
    }
    tx.moveCall({ target: "0x2::kiosk::lock", typeArguments: [it.type], arguments: [newKiosk, newCap!, pol, item!] });
    if (has(LOCK)) tx.moveCall({ target: `${KIOSK_RULES_PKG}::kiosk_lock_rule::prove`, typeArguments: [it.type], arguments: [req!, newKiosk] });
    tx.moveCall({ target: "0x2::transfer_policy::confirm_request", typeArguments: [it.type], arguments: [pol, req!] });
  }
  if (direct.length) tx.transferObjects(direct, tx.pure.address(recipient));
  if (newKiosk && newCap) {
    tx.moveCall({ target: "0x2::transfer::public_share_object", typeArguments: ["0x2::kiosk::Kiosk"], arguments: [newKiosk] });
    tx.transferObjects([newCap], tx.pure.address(recipient));
  }
}
