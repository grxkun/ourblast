// SPDX-License-Identifier: BUSL-1.1
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tgLaunchInput } from "@/lib/tg/launchInput";
import { tgLaunchToken, tgReviewLaunch, tgListWallets } from "@/lib/tg/tg.functions";

export function LaunchPanel({ initData }: { initData: string }) {
  const reviewFn = useServerFn(tgReviewLaunch), launchFn = useServerFn(tgLaunchToken);
  const listWallets = useServerFn(tgListWallets);
  const wallets = useQuery({ queryKey: ["tg-wallets", initData], queryFn: () => listWallets({ data: { initData } }), enabled: Boolean(initData), staleTime: 30_000 });
  const [pad, setPad] = useState<"blastfun" | "suipump">("blastfun");
  const [symbol, setSymbol] = useState(""), [name, setName] = useState(""), [description, setDescription] = useState(""), [icon, setIcon] = useState(""), [buy, setBuy] = useState("0"), [slot, setSlot] = useState("1");
  const [review, setReview] = useState<string | null>(null), [note, setNote] = useState<string | null>(null), [url, setUrl] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const reset = () => { setReview(null); setNote(null); setRequestKey(null); setUrl(null); };
  const input = tgLaunchInput.safeParse({ symbol, name, description, iconUrl: icon, launchpad: pad, slot: Number(slot), firstBuySui: Number(buy) });
  const act = async (confirm: boolean) => {
    if (!input.success || busy) return;
    setBusy(true); setNote(null);
    try {
      if (!confirm) {
        const r = await reviewFn({ data: { initData, ...input.data } });
        setReview(r.review); setRequestKey(crypto.randomUUID());
      } else if (requestKey) {
        const r = await launchFn({ data: { initData, ...input.data, requestKey } });
        setNote(`${r.status}\n${r.notice ?? ""}`); setUrl(r.tokenUrl); setReview(null);
      }
    } catch (e) { setNote((e as Error).message); } finally { setBusy(false); }
  };
  const field = "min-w-0 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm";
  return <section className="space-y-3">
    <h2 className="flex items-center gap-2 font-display text-xl"><Rocket className="size-5 text-primary" />Launch token</h2>
    <fieldset disabled={busy || requestKey != null && review == null} className="space-y-3">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Launchpad">{(["blastfun", "suipump"] as const).map((p) => <Button key={p} variant={pad === p ? "default" : "outline"} onClick={() => { reset(); setPad(p); setBuy("0"); }}>{p === "blastfun" ? "Blast.fun" : "Suipump"}</Button>)}</div>
      <div className="grid grid-cols-2 gap-2"><label className="text-xs">Ticker<input aria-label="Ticker" className={field} value={symbol} maxLength={10} onChange={(e) => { reset(); setSymbol(e.target.value); }} placeholder="BLASTY" /></label><label className="text-xs">Token name<input aria-label="Token name" className={field} value={name} maxLength={64} onChange={(e) => { reset(); setName(e.target.value); }} /></label></div>
      <label className="block text-xs">Token image URL<input aria-label="Token image URL" className={field} type="url" value={icon} onChange={(e) => { reset(); setIcon(e.target.value); }} placeholder="https://…" /></label>
      <label className="block text-xs">Description<textarea aria-label="Description" className={field} maxLength={500} value={description} onChange={(e) => { reset(); setDescription(e.target.value); }} /></label>
      <div className="grid grid-cols-2 gap-2"><label className="text-xs">Paying wallet<select aria-label="Paying wallet" className={field} value={slot} onChange={(e) => { reset(); setSlot(e.target.value); }}>{wallets.data?.wallets.map((w) => <option key={w.slot} value={w.slot}>W{w.slot}</option>)}</select></label><label className="text-xs">First buy (SUI)<input aria-label="First buy (SUI)" className={field} inputMode="decimal" disabled={pad === "blastfun"} value={buy} onChange={(e) => { reset(); setBuy(e.target.value); }} /></label></div>
    </fieldset>
    {wallets.isError && <p role="alert" className="text-sm text-destructive">Couldn't load your wallets. Reopen Launch to retry.</p>}
    {pad === "blastfun" && <p className="text-xs text-muted-foreground">Blast.fun: first buy unavailable; launch only.</p>}
    {review ? <div className="space-y-3 border-t border-border pt-3"><p className="whitespace-pre-wrap text-sm">{review}</p><div className="grid grid-cols-2 gap-2"><Button variant="outline" disabled={busy} onClick={reset}>Cancel</Button><Button disabled={busy} onClick={() => void act(true)}>{busy ? "Launching…" : "Confirm launch"}</Button></div></div> : <Button className="w-full" disabled={!input.success || busy || requestKey != null} onClick={() => void act(false)}>{busy ? "Checking…" : "Review launch"}</Button>}
    {note && <p role="status" className="whitespace-pre-wrap break-words text-sm">{note}</p>}
    {url && <a className="text-sm text-primary underline" href={url} target="_blank" rel="noreferrer">Open launched token</a>}
  </section>;
}