// SPDX-License-Identifier: BUSL-1.1
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Image as ImageIcon, Lock, Send } from "lucide-react";
import { getMyBankNfts, runBankCommand } from "@/lib/terminal/bank.functions";
import { Button } from "@/components/ui/button";
import { NftImage } from "@/components/NftImage";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Nft = { id: string; name: string; collection: string; image?: string | null; kiosk?: { locked: boolean } };

const RECIPIENT = /^(0x[0-9a-f]{64}|[a-z0-9-]+(\.[a-z0-9-]+)*\.sui|@[a-z0-9_]{1,15})$/i;

/** NFTs in the main OurBank Sui wallet (including its kiosk), each with a reviewed Send action. */
export function NftPanel({ userId }: { userId: string }) {
  const fetchNfts = useServerFn(getMyBankNfts);
  const run = useServerFn(runBankCommand);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["bank-nfts", userId], queryFn: () => fetchNfts(), staleTime: 60_000 });
  const [pick, setPick] = useState<Nft | null>(null);
  const [to, setTo] = useState("");
  const [step, setStep] = useState<"form" | "review">("form");
  const [result, setResult] = useState<string | null>(null);

  const send = useMutation({
    // Exact object id so the send can never pick a different NFT.
    mutationFn: (n: Nft) => run({ data: { text: `send nft ${n.id} to ${to.trim()}` } }),
    onSuccess: (r) => {
      setResult(r.reply);
      qc.invalidateQueries({ queryKey: ["bank-nfts", userId] });
    },
    onError: (e) => setResult(e instanceof Error ? e.message : "Send failed. Nothing was sent."),
  });

  const open = (n: Nft) => { setPick(n); setTo(""); setStep("form"); setResult(null); };
  const close = () => { if (!send.isPending) setPick(null); };
  const valid = RECIPIENT.test(to.trim());

  const d = q.data;
  if (d && !d.linked) return null;
  const link = result?.match(/https:\/\/suiscan\.xyz\S+/)?.[0];
  return (
    <div className="mt-3 border border-border p-3 text-sm">
      <p className="font-display uppercase"><ImageIcon className="mr-2 inline size-4" />NFTs in your OurBank wallet</p>
      {q.isLoading ? <p className="mt-2 text-xs text-muted-foreground">Reading your NFTs…</p> : null}
      {d?.error ? <p className="mt-2 text-xs text-destructive">{d.error}</p> : null}
      {d && !d.error && d.nfts.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No NFTs yet.</p> : null}
      {d && d.nfts.length > 0 ? (
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(d.nfts as Nft[]).map((n) => (
            <li key={n.id} className="flex flex-col border border-border bg-background">
              <a href={`https://suiscan.xyz/mainnet/object/${n.id}`} target="_blank" rel="noreferrer" className="relative block">
                <NftImage image={n.image} name={n.name} />
                {n.kiosk ? (
                  <span className="absolute left-1 top-1 bg-background/90 px-1 text-[0.6rem] uppercase text-foreground">
                    {n.kiosk.locked ? <Lock className="mr-0.5 inline size-2.5" /> : null}Kiosk
                  </span>
                ) : null}
              </a>
              <div className="p-1.5">
                <p className="truncate text-xs font-bold text-foreground">{n.name}</p>
                <p className="truncate text-[0.65rem] text-muted-foreground">{n.collection}</p>
              </div>
              <Button size="sm" variant="outline" className="m-1.5 mt-auto h-7 text-xs" onClick={() => open(n)}>
                <Send className="mr-1 size-3" />Send
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog open={!!pick} onOpenChange={(o) => (!o ? close() : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send {pick?.name}</DialogTitle>
            <DialogDescription>
              {pick?.kiosk?.locked
                ? "This NFT is locked in a kiosk. It will arrive in a new kiosk owned by the recipient; any royalty is paid from your SUI."
                : "Moves this NFT from your OurBank wallet. Gas is paid from your SUI."}
            </DialogDescription>
          </DialogHeader>
          {result ? (
            <div className="space-y-2 text-sm">
              <p className="break-words">{result}</p>
              {link ? <a href={link} target="_blank" rel="noreferrer" className="text-primary underline">View on Suiscan</a> : null}
            </div>
          ) : step === "form" ? (
            <div className="space-y-2">
              <Input placeholder="0x… address, name.sui or @xhandle" value={to} onChange={(e) => setTo(e.target.value)} autoFocus />
              {to && !valid ? <p className="text-xs text-destructive">Use a full 0x address, a .sui name or an @handle.</p> : null}
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              <p><span className="text-muted-foreground">NFT:</span> {pick?.name}</p>
              <p className="break-all"><span className="text-muted-foreground">Object:</span> {pick?.id}</p>
              <p className="break-all"><span className="text-muted-foreground">To:</span> {to.trim()}</p>
              <p className="text-xs text-muted-foreground">This is final. NFT sends can't be undone.</p>
            </div>
          )}
          <DialogFooter>
            {result ? (
              <Button onClick={() => setPick(null)}>Done</Button>
            ) : step === "form" ? (
              <>
                <Button variant="outline" onClick={close}>Cancel</Button>
                <Button disabled={!valid} onClick={() => setStep("review")}>Review</Button>
              </>
            ) : (
              <>
                <Button variant="outline" disabled={send.isPending} onClick={() => setStep("form")}>Back</Button>
                <Button disabled={send.isPending} onClick={() => pick && send.mutate(pick)}>
                  {send.isPending ? "Sending…" : "Confirm send"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
