// SPDX-License-Identifier: BUSL-1.1
export type BrowseNft = { id: string; type: string; name: string; collection: string; kiosk?: { locked: boolean } | null };
export type StorageFilter = "all" | "kiosk" | "loose";

/** Search by name, edition (#127 or 127), collection, or object id prefix; filter by collection type and storage. */
export function filterNfts<T extends BrowseNft>(nfts: T[], q: string, collection: string | null, storage: StorageFilter): T[] {
  const s = q.trim().toLowerCase().replace(/^#/, "");
  return nfts.filter((n) => {
    if (collection && n.type !== collection) return false;
    if (storage === "kiosk" && !n.kiosk) return false;
    if (storage === "loose" && n.kiosk) return false;
    if (!s) return true;
    if (s.startsWith("0x")) return n.id.toLowerCase().startsWith(s);
    if (/^\d+$/.test(s)) return new RegExp(`#\\s*${s}(?!\\d)`).test(n.name);
    return n.name.toLowerCase().includes(s) || n.collection.toLowerCase().includes(s);
  });
}

export function collectionCounts(nfts: BrowseNft[]): { type: string; name: string; count: number }[] {
  const m = new Map<string, { type: string; name: string; count: number }>();
  for (const n of nfts) {
    const e = m.get(n.type) ?? { type: n.type, name: n.collection, count: 0 };
    e.count++;
    m.set(n.type, e);
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

/** Struct name of a Move type, e.g. 0x..::collection::Holmot -> Holmot. */
export function structName(type: string): string {
  return type.split("<")[0].split("::").pop() ?? type;
}
