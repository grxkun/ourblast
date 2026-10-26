// SPDX-License-Identifier: BUSL-1.1
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Image as ImageIcon, Lock, Send } from "lucide-react";
import { getMyBankNfts, runBankCommand } from "@/lib/terminal/bank.functions";
import { Button } from "@/components/ui/button";
import { NftImage } from "@/components/NftImage";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DripLinks, NftToolbar, floorTotal, useDrip, useNftBrowse } from "@/components/NftBrowse";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Nft = { id: string; type: string; name: string; collection: string; image?: string | null; kiosk?: { locked: boolean } };

const RECIPIENT = /^(0x[0-9a-f]{64}|[a-z0-9-]+(\.[a-z0-9-]+)*\.sui|@[a-z0-9_]{1,15})$/i;

/** NFTs in the main OurBank Sui wallet (including its kiosk): search, filter, select, reviewed sends, drip.market links. */
export function NftPanel({ userId }: { userId: string }) {
  const fetchNfts = useServerFn(getMyBankNfts);
  const run = useServerFn(runBankCommand);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["bank-nfts", userId], queryFn: () => fetchNfts(), staleTime: 60_000 });
  const all = ((q.data?.nfts ?? []) as Nft[]);
  const b = useNftBrowse(all);
  const drip = useDrip(all);
  const [pick, setPick] = useState<Nft[] | null>(null);
  const [to, setTo] = useState("");
  const [step, setStep] = useState<"form" | "review">("form");
  const [result, setResult] = useState<string[] | null>(null);

  const send = useMutation({
    // One exact object id per send; stop at the first failure so later NFTs are never guessed.
    mutationFn: async (list: Nft[]) => {
      const out: string[] = [];
      for (const n of list) {
        const r = await run({ data: { text: `send nft ${n.id} to ${to.trim()}` } });
        out.push(`${n.name}: ${r.reply}`);
        if (!/suiscan\.xyz/.test(r.reply)) { out.push("Stopped; remaining NFTs were not sent."); break; }
      }
      return out;
    },
    onSuccess: (r) => { setResult(r); b.clear(); qc.invalidateQueries({ queryKey: ["bank-nfts", userId] }); },
    onError: (e) => setResult([e instanceof Error ? e.message : "Send failed. Check Suiscan before retrying."]),
  });

  const open = (list: Nft[]) => { setPick(list); setTo(""); setStep("form"); setResult(null); };
  const close = () => { if (!send.isPending) setPick(null); };
  const valid = RECIPIENT.test(to.trim());

  const d = q.data;
  if (d && !d.linked) return null;
  return (
    <div className="mt-3 space-y-2 border border-border p-3 text-sm">
      <p className="font-display uppercase"><ImageIcon className="mr-2 inline size-4" />NFTs in your OurBank wallet</p>
      {q.isLoading ? <p className="text-xs text-muted-foreground">Reading your NFTs…</p> : null}
      {d?.error ? <p className="text-xs text-destructive">{d.error}</p> : null}
      {d && !d.error && all.length === 0 ? <p className="text-xs text-muted-foreground">No NFTs yet.</p> : null}
      {all.length > 0 ? <NftToolbar b={b} total={all.length} /> : null}
      {b.picked.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border border-primary p-2 text-xs">
          <span>{b.picked.length} selected · floor ≈ {floorTotal(b.picked, drip).toFixed(2)} SUI</span>
          <Button size="sm" className="ml-auto h-7 text-xs" onClick={() => open(b.picked)}><Send className="mr-1 size-3" />Send selected</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={b.clear}>Clear</Button>
        </div>
      ) : null}
      {all.length > 0 && b.rows.length === 0 ? <p className="text-xs text-muted-foreground">No NFTs match.</p> : null}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {b.rows.map((n) => (
          <li key={n.id} className={`flex flex-col border bg-background ${b.selected.includes(n.id) ? "border-primary" : "border-border"}`}>
            <div className="relative">
              <a href={`https://suiscan.xyz/mainnet/object/${n.id}`} target="_blank" rel="noreferrer" className="block">
                <NftImage image={n.image} name={n.name} />
              </a>
              {n.kiosk ? (
                <span className="absolute left-1 top-1 bg-background/90 px-1 text-[0.6rem] uppercase text-foreground">
                  {n.kiosk.locked ? <Lock className="mr-0.5 inline size-2.5" /> : null}Kiosk
                </span>
              ) : null}
              <Checkbox aria-label={`Select ${n.name}`} className="absolute right-1 top-1 bg-background" checked={b.selected.includes(n.id)} onCheckedChange={() => b.toggle(n.id)} />
            </div>
            <div className="space-y-1 p-1.5">
              <p className="truncate text-xs font-bold text-foreground">{n.name}</p>
              <p className="truncate text-[0.65rem] text-muted-foreground">{n.collection}</p>
              <DripLinks d={drip.get(n.type)} />
            </div>
            <Button size="sm" variant="outline" className="m-1.5 mt-auto h-7 text-xs" onClick={() => open([n])}>
              <Send className="mr-1 size-3" />Send
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={!!pick} onOpenChange={(o) => (!o ? close() : null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send {pick?.length === 1 ? pick[0].name : `${pick?.length ?? 0} NFTs`}</DialogTitle>
            <DialogDescription>
              {pick?.some((n) => n.kiosk?.locked)
                ? "Kiosk-locked NFTs arrive in a new kiosk owned by the recipient; any royalty is paid from your SUI. Each NFT is a separate transfer."
                : "Moves these NFTs from your OurBank wallet. Gas is paid from your SUI."}
            </DialogDescription>
          </DialogHeader>
          {result ? (
            <div className="space-y-2 text-sm">
              {result.map((r, i) => {
                const link = r.match(/https:\/\/suiscan\.xyz\S+/)?.[0];
                return <p key={i} className="break-words">{r} {link ? <a href={link} target="_blank" rel="noreferrer" className="text-primary underline">Suiscan</a> : null}</p>;
              })}
            </div>
          ) : step === "form" ? (
            <div className="space-y-2">
              <Input placeholder="0x… address, name.sui or @xhandle" value={to} onChange={(e) => setTo(e.target.value)} autoFocus />
              {to && !valid ? <p className="text-xs text-destructive">Use a full 0x address, a .sui name or an @handle.</p> : null}
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              {pick?.map((n) => <p key={n.id} className="break-all"><span className="text-muted-foreground">NFT:</span> {n.name} · {n.id.slice(0, 10)}…</p>)}
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
