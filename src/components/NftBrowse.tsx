// SPDX-License-Identifier: BUSL-1.1
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getDripCollections, type DripCollection } from "@/lib/drip.functions";
import { collectionCounts, filterNfts, type BrowseNft, type StorageFilter } from "@/lib/nft-browse";

/** Search, filter and selection state shared by the web and Telegram NFT panels. */
export function useNftBrowse<T extends BrowseNft>(nfts: T[]) {
  const [q, setQ] = useState("");
  const [collection, setCollection] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageFilter>("all");
  const [selected, setSelected] = useState<string[]>([]);
  const rows = useMemo(() => filterNfts(nfts, q, collection, storage), [nfts, q, collection, storage]);
  const collections = useMemo(() => collectionCounts(nfts), [nfts]);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allSelected = rows.length > 0 && rows.every((n) => selected.includes(n.id));
  const selectAll = () => setSelected(allSelected ? selected.filter((id) => !rows.some((n) => n.id === id)) : [...new Set([...selected, ...rows.map((n) => n.id)])]);
  const picked = nfts.filter((n) => selected.includes(n.id));
  return { q, setQ, collection, setCollection, storage, setStorage, rows, collections, selected, toggle, selectAll, allSelected, picked, clear: () => setSelected([]) };
}

export function useDrip(nfts: BrowseNft[]) {
  const fetchDrip = useServerFn(getDripCollections);
  const items = collectionCounts(nfts).slice(0, 30).map((c) => ({ type: c.type, name: c.name }));
  const q = useQuery({
    queryKey: ["drip", items.map((i) => i.type).sort().join(",")],
    queryFn: () => fetchDrip({ data: { items } }),
    enabled: items.length > 0,
    staleTime: 5 * 60_000,
  });
  return new Map<string, DripCollection>((q.data ?? []).map((d) => [d.type, d]));
}

export function NftToolbar({ b, total }: { b: ReturnType<typeof useNftBrowse<BrowseNft>>; total: number }) {
  const chip = (on: boolean) => `shrink-0 border px-2 py-1 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`;
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Search NFTs" className="pl-8" placeholder="Search name, #number, collection or 0x id" value={b.q} onChange={(e) => b.setQ(e.target.value)} />
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        <button type="button" className={chip(!b.collection)} onClick={() => b.setCollection(null)}>All ({total})</button>
        {b.collections.map((c) => (
          <button key={c.type} type="button" className={chip(b.collection === c.type)} onClick={() => b.setCollection(c.type)}>{c.name} ({c.count})</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {(["all", "kiosk", "loose"] as const).map((s) => (
          <button key={s} type="button" className={chip(b.storage === s)} onClick={() => b.setStorage(s)}>{s === "all" ? "Any storage" : s === "kiosk" ? "Kiosk" : "Wallet"}</button>
        ))}
        <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" disabled={!b.rows.length} onClick={b.selectAll}>{b.allSelected ? "Deselect all" : "Select all"}</Button>
      </div>
    </div>
  );
}

export function DripLinks({ d }: { d?: DripCollection }) {
  const url = d?.url ?? "https://drip.market/nfts";
  const a = "inline-flex items-center justify-center gap-0.5 border border-border px-1 py-0.5 text-[0.6rem] uppercase hover:bg-accent";
  return (
    <div className="space-y-1">
      <p className="text-[0.65rem] text-muted-foreground">{d?.floorSui != null ? `Floor ${d.floorSui} SUI` : d?.slug ? "No listings" : "Not on drip"}</p>
      <div className="grid grid-cols-4 gap-0.5">
        {["Buy", "Sell", "List", "Bid"].map((l) => (
          <a key={l} href={url} target="_blank" rel="noreferrer" className={a} title={`${l} on drip.market`}>{l}<ExternalLink className="size-2" /></a>
        ))}
      </div>
    </div>
  );
}

export function floorTotal(picked: BrowseNft[], drip: Map<string, DripCollection>): number {
  return picked.reduce((s, n) => s + (drip.get(n.type)?.floorSui ?? 0), 0);
}
