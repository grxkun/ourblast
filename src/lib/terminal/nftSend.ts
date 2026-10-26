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
// "Holmot #127", "Holmot 127", and unspaced on-chain titles like "Bluey Bubble Time#630".
const NUMBERED_TARGET = /^(.+?)(?:\s*#\s*|\s+(?:number\s+|no\.?\s*)?)(\d+)$/i;

/** "nfts", "my nfts", "assets", "show my nfts" — read-only inventory request. */
export function isNftListRequest(raw: string): boolean {
  const t = raw.replace(/@ourblastbot\b/gi, " ").replace(/\s+/g, " ").trim().replace(/[?.!]+$/, "");
  return /^(?:\/?(?:nfts?|assets|collectibles)|(?:show|list|see|view|check)?\s*(?:me\s+)?(?:my\s+)?(?:nfts?|assets|collectibles))$/i.test(t);
}

function numberedTarget(raw: string): { collection: string; edition: string } | null {
  const match = NUMBERED_TARGET.exec(raw);
  if (!match?.[1] || !match[2]) return null;
  const collection = match[1].replace(/\s+nfts?$/i, "").replace(/^\$/, "").trim().toLowerCase();
  if (!collection) return null;
  return { collection, edition: BigInt(match[2]).toString() };
}

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
  // A collection plus an edition is explicit NFT intent even without the word "nft".
  const numbered = /^(?:send|transfer|give)\s+(?:(?:my|the)\s+)?(.+?)\s+to\s+(\S+)$/i.exec(text);
  if (numbered?.[1] && numbered[2]) {
    const target = numberedTarget(numbered[1].replace(/\s+nfts?$/i, ""));
    if (target && !/^(?:all|\d+)\s/i.test(target.collection)) {
      const to = parseRecipient(numbered[2]);
      if (!to) return null;
      return { target: `${target.collection} #${target.edition}`, isObjectId: false, count: 1, ...to };
    }
  }
  const m = /^(?:send|transfer|give)\s+(?:(all|\d{1,2})\s+)?(?:(?:my|the)\s+)?(?:(nfts?)\s+(\S+)|(.+?)\s+nfts?)\s+to\s+(\S+)$/i.exec(text);
  if (!m) return null;
  const recipient = m[5];
  if (!recipient) return null;
  const to = parseRecipient(recipient);
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
    const want = cmd.target.toLowerCase().replace(/^0x0*/, "");
    return nfts.filter((n) => n.id.toLowerCase().replace(/^0x0*/, "") === want);
  }
  const numbered = numberedTarget(cmd.target);
  if (numbered) {
    const hits = nfts.filter((n) => {
      const name = numberedTarget(n.name.trim());
      if (!name || name.edition !== numbered.edition) return false;
      return name.collection === numbered.collection || n.collection.trim().toLowerCase() === numbered.collection;
    });
    // Never choose arbitrarily when two owned items share the same edition.
    return hits.length === 1 ? hits : [];
  }
  const q = cmd.target.toLowerCase();
  const hits = nfts.filter((n) =>
    n.name.toLowerCase().includes(q) || n.collection.toLowerCase().includes(q) || n.type.toLowerCase().includes(`::${q}`),
  );
  const n = cmd.count === "all" ? MAX_NFTS_PER_SEND : cmd.count;
  return hits.slice(0, n);
}
