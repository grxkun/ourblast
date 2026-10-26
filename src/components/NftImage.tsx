// SPDX-License-Identifier: BUSL-1.1
import { useState } from "react";
import { Image as ImageIcon } from "lucide-react";

const GATEWAYS = ["https://ipfs.filebase.io/ipfs/", "https://gateway.pinata.cloud/ipfs/", "https://dweb.link/ipfs/"];

/** Candidate URLs: the given one, then the same IPFS CID on backup gateways. */
export function imageCandidates(src: string | null | undefined): string[] {
  if (!src) return [];
  const cid = src.match(/\/ipfs\/(.+)$/)?.[1] ?? (src.startsWith("ipfs://") ? src.slice(7) : null);
  if (!cid) return [src];
  return [...new Set([src.startsWith("ipfs://") ? GATEWAYS[0] + cid : src, ...GATEWAYS.map((g) => g + cid)])];
}

export function NftImage({ image, name }: { image?: string | null; name: string }) {
  const list = imageCandidates(image);
  const [i, setI] = useState(0);
  if (i >= list.length) {
    return <div className="grid aspect-square w-full place-items-center bg-muted text-muted-foreground"><ImageIcon className="size-8" aria-label="No image" /></div>;
  }
  return <img src={list[i]} alt={name} loading="lazy" referrerPolicy="no-referrer" className="aspect-square w-full object-cover" onError={() => setI(i + 1)} />;
}
