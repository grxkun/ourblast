// SPDX-License-Identifier: BUSL-1.1
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * Cross-chain "Buy with ETH / SOL" via the hosted Mayan swap widget.
 * Pure frontend embed: users sign with their own EVM/Solana wallet and
 * receive SUI on Sui, then swap into $BLAST. No contracts, no custody.
 */
const MAYAN_SRC = "https://cdn.mayan.finance/widget/1_8_0/main.js";
const MAYAN_SRI = "sha256-csokBs9wUf3aZCKTR7/XXElwXugjzCQeUygLmN+/Y7Y=";
const ROOT_ID = "mayan-widget-root";

declare global {
  interface Window { MayanSwap?: { init: (el: string | HTMLElement, cfg: unknown) => void } }
}

function loadMayan(): Promise<void> {
  if (window.MayanSwap) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${MAYAN_SRC}"]`);
    const s = existing ?? document.createElement("script");
    s.addEventListener("load", () => resolve());
    s.addEventListener("error", () => reject(new Error("load failed")));
    if (!existing) {
      s.src = MAYAN_SRC;
      s.integrity = MAYAN_SRI;
      s.crossOrigin = "anonymous";
      s.async = true;
      document.head.appendChild(s);
    }
  });
}

export function CrossChainBuy({ blastUrl }: { blastUrl: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const mounted = useRef(false);

  useEffect(() => {
    if (!open) { mounted.current = false; return; }
    setState("loading");
    let cancelled = false;
    loadMayan()
      .then(() => {
        if (cancelled || mounted.current) return;
        const el = document.getElementById(ROOT_ID);
        if (!el || !window.MayanSwap) throw new Error("missing");
        window.MayanSwap.init(el, {
          appIdentity: { uri: window.location.origin, icon: `${window.location.origin}/favicon.ico`, name: "OURBLAST" },
          destinationChains: ["sui"],
          defaultToChain: "sui",
          setDefaultToken: true,
        });
        mounted.current = true;
        setState("ready");
      })
      .catch(() => !cancelled && setState("error"));
    return () => { cancelled = true; };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="rounded-lg border-[3px] border-border bg-secondary px-4 py-2 font-display text-lg text-secondary-foreground shadow-[4px_4px_0_0_var(--ink)]">
          BUY WITH ETH / SOL
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-[480px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl uppercase">Buy from another chain</DialogTitle>
          <DialogDescription className="font-body">
            1. Pay with ETH, SOL or USDC from Ethereum, Base, Arbitrum, BSC or Solana — you receive SUI on Sui in seconds.
            <br />2. Then swap SUI → $BLAST{" "}
            <a href={blastUrl} target="_blank" rel="noreferrer" className="text-primary underline">on Bluefin</a>
            {" "}or ask @Ourblastbot.
          </DialogDescription>
        </DialogHeader>
        {state === "loading" && <p className="font-body text-sm text-muted-foreground">Loading swap…</p>}
        {state === "error" && (
          <p className="font-body text-sm text-destructive">
            Couldn't load the swap. Try again, or open{" "}
            <a href="https://swap.mayan.finance" target="_blank" rel="noreferrer" className="underline">swap.mayan.finance</a>.
          </p>
        )}
        <div id={ROOT_ID} className="min-h-[520px] w-full" />
        <p className="font-body text-xs text-muted-foreground">
          Powered by Mayan. You sign with your own wallet; OURBLAST never holds your funds. Use a Sui address you control as the destination.
        </p>
      </DialogContent>
    </Dialog>
  );
}
