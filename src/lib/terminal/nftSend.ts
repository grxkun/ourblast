// SPDX-License-Identifier: BUSL-1.1
import type { BankRecipientKind } from "./bank";

export interface NftSendCommand {
  /** Object id (0x…) or a name/collection to match, e.g. "holmot". */
  target: string;
  isObjectId: boolean;
  /** How many matching NFTs to send ("all" = every match). */
  count: number | "all";
  recipientKind: BankRecipientKind;
  recipient: string;
}

export const MAX_NFTS_PER_SEND = 20;
const OBJECT_ID = /^0x[0-9a-f]{1,64}$/i;

function parseRecipient(raw: string): { recipientKind: BankRecipientKind; recipient: string } | null {
  const t = raw.trim().replace(/[.,!?]+$/, "");
  if (/^0x[0-9a-f]{64}$/i.test(t)) return { recipientKind: "address", recipient: t.toLowerCase() };
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.sui$/i.test(t)) return { recipientKind: "suins", recipient: t.toLowerCase() };
  if (/^@[a-z0-9_]{1,15}$/i.test(t) && !/^@ourblast(bot)?$/i.test(t)) return { recipientKind: "x", recipient: t.slice(1) };
  return null;
}

/**
 * "send nft 0xabc… to adeniyi.sui" · "send my holmot nft to @friend" · "send 3 holmot nfts to 0x…" · "send all holmot nfts to 0x…".
 * Only commands that say "nft" match, so coin sends are never mistaken for NFT sends.
 */
export function parseNftSendCommand(raw: string): NftSendCommand | null {
  const text = raw.replace(/@ourblastbot\b/gi, " ").replace(/\s+/g, " ").trim();
  const m = /^(?:send|transfer|give)\s+(?:(all|\d{1,2})\s+)?(?:(?:my|the)\s+)?(?:(nfts?)\s+(\S+)|(.+?)\s+nfts?)\s+to\s+(\S+)$/i.exec(text);
  if (!m) return null;
  const to = parseRecipient(m[5]!);
  if (!to) return null;
  const target = (m[3] ?? m[4] ?? "").replace(/^\$/, "").trim();
  if (!target) return null;
  const isObjectId = OBJECT_ID.test(target);
  let count: number | "all" = 1;
  if (m[1]) count = m[1].toLowerCase() === "all" ? "all" : Number(m[1]);
  if (count !== "all" && (count < 1 || count > MAX_NFTS_PER_SEND)) return null;
  if (isObjectId && count !== 1) return null;
  return { target: isObjectId ? target.toLowerCase() : target.toLowerCase(), isObjectId, count, ...to };
}

/** Picks which owned NFTs a command refers to. Name matches use the NFT name, collection or type. */
export function pickNfts<T extends { id: string; name: string; collection: string; type: string }>(
  nfts: T[],
  cmd: Pick<NftSendCommand, "target" | "isObjectId" | "count">,
): T[] {
  if (cmd.isObjectId) {
    const want = cmd.target.replace(/^0x0*/, "");
    return nfts.filter((n) => n.id.toLowerCase().replace(/^0x0*/, "") === want);
  }
  const q = cmd.target.toLowerCase();
  const hits = nfts.filter((n) =>
    n.name.toLowerCase().includes(q) || n.collection.toLowerCase().includes(q) || n.type.toLowerCase().includes(`::${q}`),
  );
  const n = cmd.count === "all" ? MAX_NFTS_PER_SEND : cmd.count;
  return hits.slice(0, n);
}
