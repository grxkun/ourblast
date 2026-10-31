// SPDX-License-Identifier: BUSL-1.1
/**
 * OURBLAST's Blast partner deal. The shared Partner ID comes from
 * BLAST_PARTNER_ID once Blast registers our PartnerCap; until then every
 * call reports "not registered" and nothing changes.
 */
import { Transaction } from "@mysten/sui/transactions";
import { PARTNER_TYPE, inForce, pendingChange, type Timelocked } from "./partners";

const LAUNCH_PKG = "0x079a1b44c551613cbc63cc0406f8ff8d717407378dd6f17d43d9e1b3fd63a573";
const VERSION = { objectId: "0xe63adb5817a9a74a883062ac3790d21a6433dfbd35a9403d18261de3a8836f93", initialSharedVersion: "2" };
const RUNTIME = { objectId: "0x6d0c08363ebc1e2a77f16fed290dd0cd5f52791285744d758a3b0942073b6785", initialSharedVersion: "1" };
const LAUNCH_CONFIG = "0xb1c860103a7c89c7def5ec92bc0585f26bf927ac6b3df48c985e1154e4765391";

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
  const now = Date.now();
  const share = c.json.share_bps as Timelocked<string>;
  const cap = c.json.cap_id as Timelocked<string>;
  const pend = pendingChange(share, now);
  return {
    id, recipient: c.json.recipient, shareBps: Number(inForce(share, now)),
    pendingShareBps: pend == null ? null : Number(pend), capId: inForce(cap, now),
    launchpadAccepted: await launchpadAccepts(id).catch(() => false),
  };
}

/** LaunchConfig dynamic field PartnerKey(id) → u64 "accepted until". */
async function launchpadAccepts(id: string): Promise<boolean> {
  const { suiGql } = await import("@/lib/terminal/sui-rpc-compat.server");
  const r = await suiGql<{ object?: { dynamicFields?: { nodes?: { name?: { type?: { repr?: string }; json?: any }; value?: { json?: any } }[] } } }>(
    `query($id: SuiAddress!) { object(address: $id) { dynamicFields(first: 50) { nodes { name { type { repr } json } value { ... on MoveValue { json } } } } } }`,
    { id: LAUNCH_CONFIG },
  );
  const hit = r.object?.dynamicFields?.nodes?.find((n) => String(n.name?.type?.repr ?? "").endsWith("::launch_config::PartnerKey") && JSON.stringify(n.name?.json ?? "").toLowerCase().includes(id.slice(2).toLowerCase()));
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
    arguments: [tx.sharedObjectRef({ ...l, mutable: true }), tx.sharedObjectRef({ ...VERSION, mutable: false }), tx.sharedObjectRef({ ...RUNTIME, mutable: false }), tx.sharedObjectRef({ ...p, mutable: false }), tx.object.clock()],
  });
  return tx;
}

export function partnerSummary(s: PartnerState | null): string {
  if (!s) return "Blast partner: not registered yet. Mint a PartnerCap, send its ID + payout address to Blast, then set BLAST_PARTNER_ID.";
  return `Blast partner ${s.id.slice(0, 10)}…\nShare: ${(s.shareBps / 100).toFixed(2)}% of Blast's fee${s.pendingShareBps != null ? ` (→ ${(s.pendingShareBps / 100).toFixed(2)}% pending, 7-day timelock)` : ""}\nPaid to: ${s.recipient}\nLaunchpad accepts: ${s.launchpadAccepted ? "yes" : "no"}\nUsers pay the same fee with or without a partner.`;
}
