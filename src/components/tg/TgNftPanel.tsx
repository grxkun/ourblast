// SPDX-License-Identifier: BUSL-1.1
import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, Image as ImageIcon, Lock, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { tgWalletNfts, tgRunCommand } from "@/lib/tg/tg.functions";
import { nftCollectionKey, nftSendCommand, NFT_RECIPIENT, visibleNfts } from "@/lib/tg/nftInventory";

type Nft = Awaited<ReturnType<typeof tgWalletNfts>>["nfts"][number];

export function TgNftPanel({ initData, handle }: { initData: string; handle: string }) {
  const read = useServerFn(tgWalletNfts);
  const run = useServerFn(tgRunCommand);
  const qc = useQueryClient();
  const queryKey = ["tg-wallet-nfts", handle.toLowerCase()];
  const q = useQuery({ queryKey, queryFn: () => read({ data: { initData } }), staleTime: 60_000 });
  const [hidden, setHidden] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [pick, setPick] = useState<Nft | null>(null);
  const [to, setTo] = useState("");
  const [review, setReview] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const storageKey = `ourblast:hidden-nft-collections:${handle.toLowerCase()}`;

  useEffect(() => {
    setHidden([]);
    setPick(null);
    try {
      const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      if (Array.isArray(value)) setHidden(value.filter((v): v is string => typeof v === "string"));
    } catch { setStorageError(true); }
  }, [storageKey]);

  const toggleHidden = (n: Nft) => {
    const key = nftCollectionKey(n);
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
    setHidden(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { setStorageError(true); }
  };

  const send = useMutation({
    mutationFn: async ({ id, recipient }: { id: string; recipient: string }) => {
      const text = nftSendCommand(id, recipient);
      if (!text) throw new Error("Use a full Sui object ID and a valid recipient.");
      return run({ data: { initData, text } });
    },
    onSuccess: (r) => {
      setResult(r.reply);
      void qc.invalidateQueries({ queryKey });
    },
    onError: () => setResult("Couldn't confirm the send result. Check Suiscan and refresh your inventory before trying again."),
  });

  const nfts = q.data?.nfts ?? [];
  const rows = visibleNfts(nfts, hidden, showHidden);
  const hiddenCount = visibleNfts(nfts, hidden, true).length;
  const link = result?.match(/https:\/\/suiscan\.xyz[^\s)]+/)?.[0];

  return (
    <section className="space-y-3" aria-label="NFT inventory">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg"><ImageIcon className="size-4" />NFTs · W1</h2>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setShowHidden(!showHidden)}><Eye className="size-4" />{showHidden ? "Inventory" : `Hidden (${hiddenCount})`}</Button>
          <Button size="icon-sm" variant="ghost" disabled={q.isFetching} title="Refresh NFTs" aria-label="Refresh NFTs" onClick={() => void q.refetch()}><RefreshCw className={q.isFetching ? "animate-spin" : ""} /></Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Main Sui wallet · {showHidden ? "Hidden collections" : "Wallet and kiosk NFTs"}</p>
      {storageError && <p className="text-xs text-muted-foreground">Hidden choices couldn't be saved on this device.</p>}
      {(q.error || q.data?.error) && <p role="alert" className="text-sm text-destructive">{q.data?.error ?? "Couldn't read your NFTs. Please refresh."}</p>}
      {q.isPending ? <p className="text-sm text-muted-foreground">Reading your NFTs…</p> : !q.error && !q.data?.error && rows.length === 0 ? <p className="text-sm text-muted-foreground">{showHidden ? "No hidden NFTs." : hiddenCount ? "All NFTs are hidden." : "No NFTs in your main wallet yet."}</p> : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {rows.map((n) => (
          <li key={n.id} className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
            <a href={`https://suiscan.xyz/mainnet/object/${n.id}`} target="_blank" rel="noreferrer" className="relative block" aria-label={`View ${n.name} on Suiscan`}>
              <NftImage image={n.image} name={n.name} />
              {n.kiosk && <span className="absolute left-1 top-1 flex items-center gap-1 bg-background/90 px-1.5 py-1 text-xs">{n.kiosk.locked && <Lock className="size-3" />}Kiosk</span>}
            </a>
            <div className="space-y-1 p-2">
              <p className="break-words text-sm font-semibold">{n.name}</p>
              <p className="break-words text-xs text-muted-foreground">{n.collection}</p>
              <div className="flex items-center gap-1 pt-1">
                {!showHidden && <Button size="sm" variant="outline" className="flex-1" onClick={() => { setPick(n); setTo(""); setReview(false); setResult(null); }}><Send />Send</Button>}
                <Button size={showHidden ? "sm" : "icon-sm"} variant="ghost" title={showHidden ? "Restore collection" : "Hide collection on this device"} aria-label={showHidden ? `Restore ${n.collection} collection` : `Hide ${n.collection} collection`} onClick={() => toggleHidden(n)}>{showHidden ? <><Eye />Restore</> : <EyeOff />}</Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(pick)} onOpenChange={(open) => { if (!open && !send.isPending) setPick(null); }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="break-words">Send {pick?.name}</DialogTitle>
            <DialogDescription>{pick?.kiosk?.locked ? "Arrives in a new recipient-owned kiosk. Gas and any collection royalty are paid from your SUI." : "Moves this NFT from W1, your main OurBank wallet. Gas is paid from your SUI."}</DialogDescription>
          </DialogHeader>
          {result ? <div className="space-y-2 text-sm"><p className="break-words">{result}</p>{link && <a href={link} target="_blank" rel="noreferrer" className="text-primary underline">View on Suiscan</a>}</div> : review ? <div className="space-y-2 text-sm"><p className="break-all">Object: {pick?.id}</p><p className="break-all">To: {to.trim()}</p><p className="text-muted-foreground">NFT transfers are final and cannot be undone.</p></div> : <div className="space-y-2"><Input aria-label="NFT recipient" placeholder="0x… address, name.sui or @handle" value={to} onChange={(e) => setTo(e.target.value)} />{to && !NFT_RECIPIENT.test(to.trim()) && <p className="text-xs text-destructive">Use a full Sui address, a .sui name or an @handle.</p>}</div>}
          <DialogFooter>
            {result ? <Button onClick={() => setPick(null)}>Done</Button> : review ? <><Button variant="outline" disabled={send.isPending} onClick={() => setReview(false)}>Back</Button><Button disabled={send.isPending} onClick={() => { if (pick) send.mutate({ id: pick.id, recipient: to.trim() }); }}>{send.isPending ? "Sending…" : "Confirm send"}</Button></> : <><Button variant="outline" onClick={() => setPick(null)}>Cancel</Button><Button disabled={!NFT_RECIPIENT.test(to.trim())} onClick={() => setReview(true)}>Review</Button></>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function NftImage({ image, name }: { image: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  return image && !failed ? <img src={image} alt={name} loading="lazy" referrerPolicy="no-referrer" className="aspect-square w-full object-cover" onError={() => setFailed(true)} /> : <div className="grid aspect-square place-items-center bg-muted text-muted-foreground"><ImageIcon className="size-8" aria-label="No image" /></div>;
}