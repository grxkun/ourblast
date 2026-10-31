// SPDX-License-Identifier: BUSL-1.1
/**
 * Mints a Blast PartnerCap with the connected wallet (the wallet owner signs).
 * Shows existing caps first so the operator never mints a second by accident.
 */
import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useBlast } from "@/components/blast/session";
import { PARTNER_CAP_TYPE, buildMintPartnerCap } from "@/lib/blast/partners";
import { DEFAULT_TREASURY_ADDRESS, FOUNDER_ADDRESS, SUI_GRAPHQL } from "@/lib/ourblast.config";

async function ownedCaps(owner: string): Promise<string[]> {
  const res = await fetch(SUI_GRAPHQL["sui:mainnet"]!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: "query($a:SuiAddress!,$t:String!){address(address:$a){objects(first:20,filter:{type:$t}){nodes{address}}}}",
      variables: { a: owner, t: PARTNER_CAP_TYPE },
    }),
  });
  const json = (await res.json()) as { data?: { address?: { objects?: { nodes?: { address: string }[] } } } };
  return (json.data?.address?.objects?.nodes ?? []).map((n) => n.address);
}

export function PartnerCapCard() {
  const { signAndExecute, profile } = useBlast();
  const [owner, setOwner] = useState<string>(FOUNDER_ADDRESS);
  const [caps, setCaps] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [teamCaps, setTeamCaps] = useState<{ who: string; addr: string; caps: string[] }[]>([]);

  useEffect(() => {
    const team = [
      { who: "Developer wallet", addr: FOUNDER_ADDRESS },
      { who: "Treasury wallet", addr: DEFAULT_TREASURY_ADDRESS },
    ];
    void Promise.all(team.map(async (t) => ({ ...t, caps: await ownedCaps(t.addr).catch(() => []) }))).then(setTeamCaps);
  }, [digest]);
  const anyTeamCap = teamCaps.some((t) => t.caps.length > 0);

  const refresh = useCallback(async (addr: string) => {
    try { setCaps(await ownedCaps(addr)); } catch { setCaps(null); }
  }, []);

  useEffect(() => {
    const addr = (profile as { wallet_address?: string } | null)?.wallet_address;
    const a = addr && addr.startsWith("0x") ? addr : FOUNDER_ADDRESS;
    setOwner(a);
    void refresh(a);
  }, [profile, refresh]);

  const mint = async () => {
    if (!confirming) return setConfirming(true);
    setBusy(true);
    try {
      const r = await signAndExecute((_tx, sender) => buildMintPartnerCap(sender));
      setDigest(r.digest);
      setOwner(r.sender);
      toast.success("PartnerCap minted");
      setTimeout(() => void refresh(r.sender), 3000);
    } catch (e) {
      toast.error((e as Error).message || "Mint failed.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const copy = (v: string) => { void navigator.clipboard.writeText(v); toast.success("Copied"); };

  return (
    <section className="border border-border bg-card p-4 space-y-3">
      <h2 className="font-display text-lg uppercase"><KeyRound className="mr-2 inline size-4" />Blast PartnerCap</h2>
      <p className="text-sm text-muted-foreground">
        Mint the cap with your developer wallet, then send its ID and payout address to the Blast team. Your
        connected wallet signs; OURBLAST never holds this cap. Costs only gas (~0.01 SUI).
      </p>
      <div className="text-xs break-all">Checking wallet: <span className="font-mono">{owner}</span></div>
      {caps && caps.length > 0 ? (
        <div className="space-y-1">
          <p className="text-sm font-bold">You already own {caps.length} PartnerCap{caps.length > 1 ? "s" : ""} — no need to mint again:</p>
          {caps.map((c) => (
            <button key={c} onClick={() => copy(c)} className="flex w-full items-center gap-2 break-all text-left font-mono text-xs">
              <Copy className="size-3 shrink-0" />{c}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm">No PartnerCap found in this wallet yet.</p>
      )}
      {teamCaps.map((t) => (
        <p key={t.addr} className="text-xs">
          {t.who}: {t.caps.length > 0 ? <span className="font-bold">has a PartnerCap — don't mint again ({(t.caps[0] ?? "").slice(0, 10)}…)</span> : "no cap yet"}
        </p>
      ))}
      {digest && (
        <a className="block text-xs underline" href={`https://suiscan.xyz/mainnet/tx/${digest}`} target="_blank" rel="noreferrer">
          View mint transaction
        </a>
      )}
      <Button onClick={mint} disabled={busy || anyTeamCap} variant={confirming ? "destructive" : "default"}>
        {busy ? "Waiting for wallet…" : confirming ? "Confirm: sign mint in wallet" : "Mint PartnerCap"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Send Blast: Cap ID + payout address (dev wallet now; you can change the payout later instantly, or move the cap
        to the treasury). After they register it, set the Partner ID they give you as BLAST_PARTNER_ID.
      </p>
    </section>
  );
}
