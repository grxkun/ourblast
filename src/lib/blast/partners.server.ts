// SPDX-License-Identifier: BUSL-1.1
/**
 * OURBLAST's Blast partner deal. The shared Partner ID comes from
 * BLAST_PARTNER_ID once Blast registers our PartnerCap; until then every
 * call reports "not registered" and nothing changes.
 */
import { Transaction } from "@mysten/sui/transactions";
import { productionTimedValue } from "./partners";
import {
  BLAST_V2_LAUNCH_PKG as LAUNCH_PKG, BLAST_V2_VERSION as VERSION,
  BLAST_V2_LAUNCH_CONFIG as LAUNCH_CONFIG, BLAST_V2_TREASURY,
  BLAST_V2_PARTNER_TYPE as PARTNER_TYPE,
} from "./contracts";

export function partnerId(): string | null {
  const v = process.env["BLAST_PARTNER_ID"]?.trim();
  return v && /^0x[0-9a-f]{64}$/i.test(v) ? v : null;
}

export interface PartnerState {
  id: string; recipient: string; shareBps: number; pendingShareBps: number | null;
  capId: string; launchpadAccepted: boolean;
}

export async function readPartner(id = partnerId()): Promise<PartnerState | null> {
  if (!id) return null;
  const { suiGql } = await import("@/lib/terminal/sui-rpc-compat.server");
  const r = await suiGql<{ object?: { asMoveObject?: { contents?: { type?: { repr?: string }; json?: any } } } }>(
    `query($id: SuiAddress!) { object(address: $id) { asMoveObject { contents { type { repr } json } } } }`, { id },
  );
  const c = r.object?.asMoveObject?.contents;
  if (!c?.json || !String(c.type?.repr ?? "").startsWith(PARTNER_TYPE)) return null;
  const share = productionTimedValue<string>(c.json.share_bps);
  const cap = productionTimedValue<string>(c.json.cap_id);
  return {
    id, recipient: c.json.recipient, shareBps: Number(share.current),
    pendingShareBps: share.pending == null ? null : Number(share.pending), capId: cap.current,
    launchpadAccepted: await launchpadAccepts(id).catch(() => false),
  };
}

/** Production LaunchConfig stores accepted-until values in a nested partner table. */
async function launchpadAccepts(id: string): Promise<boolean> {
  const { suiGql } = await import("@/lib/terminal/sui-rpc-compat.server");
  const config = await suiGql<{ object?: { asMoveObject?: { contents?: { json?: { partners?: { acceptance_ends_at_ms?: { id?: string } } } } } } }>(
    `query($id: SuiAddress!) { object(address: $id) { asMoveObject { contents { json } } } }`, { id: LAUNCH_CONFIG },
  );
  const tableId = config.object?.asMoveObject?.contents?.json?.partners?.acceptance_ends_at_ms?.id;
  if (!tableId) return false;
  const r = await suiGql<{ object?: { dynamicFields?: { nodes?: { name?: { type?: { repr?: string }; json?: any }; value?: { json?: any } }[] } } }>(
    `query($id: SuiAddress!) { object(address: $id) { dynamicFields(first: 50) { nodes { name { type { repr } json } value { ... on MoveValue { json } } } } } }`,
    { id: tableId },
  );
  const hit = r.object?.dynamicFields?.nodes?.find((n) => String(n.name?.type?.repr ?? "") === "address" && String(n.name?.json ?? "").toLowerCase() === id.toLowerCase());
  return !!hit && Date.now() < Number(hit.value?.json ?? 0);
}

/** Adds launch::set_partner to a v2 LaunchInitializer (call before finalize). No-op without a deal. */
export async function attachPartner(tx: Transaction, initializer: any, memeType: string, quoteType: string): Promise<boolean> {
  const id = partnerId();
  if (!id) return false;
  const { sharedRef } = await import("@/lib/terminal/suipump-launch.server");
  const [p, cfg] = await Promise.all([sharedRef(id), sharedRef(LAUNCH_CONFIG)]);
  tx.moveCall({
    target: `${LAUNCH_PKG}::launch::set_partner`, typeArguments: [memeType, quoteType],
    arguments: [initializer, tx.sharedObjectRef({ ...VERSION, mutable: false }), tx.sharedObjectRef({ ...cfg, mutable: false }), tx.sharedObjectRef({ ...p, mutable: false }), tx.object.clock()],
  });
  return true;
}

/** Permissionless claim of Blast's held fees on a launch naming our partner; payees are fixed on chain. */
export async function buildPartnerFeeClaim(sender: string, launchId: string, memeType: string, quoteType: string): Promise<Transaction | null> {
  const id = partnerId();
  if (!id) return null;
  const { sharedRef } = await import("@/lib/terminal/suipump-launch.server");
  const [l, p] = await Promise.all([sharedRef(launchId), sharedRef(id)]);
  const tx = new Transaction();
  tx.setSender(sender);
  tx.moveCall({
    target: `${LAUNCH_PKG}::launch::claim_protocol_fees_with_partner`, typeArguments: [memeType, quoteType],
    // Production claim takes Treasury, not RuntimeConfig; TxContext is implicit.
    arguments: [tx.sharedObjectRef({ ...l, mutable: true }), tx.sharedObjectRef({ ...VERSION, mutable: false }), tx.object(BLAST_V2_TREASURY), tx.sharedObjectRef({ ...p, mutable: false })],
  });
  return tx;
}

export function partnerSummary(s: PartnerState | null): string {
  if (!s) return "Blast partner: not registered yet. Mint a PartnerCap, send its ID + payout address to Blast, then set BLAST_PARTNER_ID.";
  return `Blast partner ${s.id.slice(0, 10)}…\nShare: ${(s.shareBps / 100).toFixed(2)}% of Blast's fee${s.pendingShareBps != null ? ` (→ ${(s.pendingShareBps / 100).toFixed(2)}% pending, 7-day timelock)` : ""}\nPaid to: ${s.recipient}\nLaunchpad accepts: ${s.launchpadAccepted ? "yes" : "no"}\nUsers pay the same fee with or without a partner.`;
}
