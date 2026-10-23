// SPDX-License-Identifier: BUSL-1.1
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Image as ImageIcon } from "lucide-react";
import { getMyBankNfts } from "@/lib/terminal/bank.functions";

/** Read-only gallery of NFTs in the main OurBank Sui wallet. */
export function NftPanel({ userId }: { userId: string }) {
  const fetchNfts = useServerFn(getMyBankNfts);
  const q = useQuery({ queryKey: ["bank-nfts", userId], queryFn: () => fetchNfts(), staleTime: 60_000 });
  const d = q.data;
  if (d && !d.linked) return null;
  return (
    <div className="mt-3 border border-border p-3 text-sm">
      <p className="font-display uppercase"><ImageIcon className="mr-2 inline size-4" />NFTs in your OurBank wallet</p>
      {q.isLoading ? <p className="mt-2 text-xs text-muted-foreground">Reading your NFTs…</p> : null}
      {d?.error ? <p className="mt-2 text-xs text-destructive">{d.error}</p> : null}
      {d && !d.error && d.nfts.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No NFTs yet.</p> : null}
      {d && d.nfts.length > 0 ? (
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {d.nfts.map((n) => (
            <li key={n.id} className="border border-border bg-background">
              <a href={`https://suiscan.xyz/mainnet/object/${n.id}`} target="_blank" rel="noreferrer" className="block">
                {n.image ? (
                  <img src={n.image} alt={n.name} loading="lazy" className="aspect-square w-full object-cover" />
                ) : (
                  <div className="grid aspect-square w-full place-items-center bg-muted text-xs text-muted-foreground">No image</div>
                )}
                <div className="p-1.5">
                  <p className="truncate text-xs font-bold text-foreground">{n.name}</p>
                  <p className="truncate text-[0.65rem] text-muted-foreground">{n.collection}</p>
                </div>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
