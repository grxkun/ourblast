// SPDX-License-Identifier: BUSL-1.1
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { ALTERNATE_ROUTES, MAYAN_SOURCE_CHAINS } from "@/lib/terminal/crossChain";
import { getCrossChainOrder, startCrossChainOrder } from "@/lib/terminal/crossChain.functions";

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
          sourceChains: [...MAYAN_SOURCE_CHAINS],
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
    // Non-modal: Mayan opens its chain/token menu outside the dialog, which a modal dialog blocks.
    <Dialog open={open} onOpenChange={setOpen} modal={false}>
      <DialogTrigger asChild>
        <button type="button" className="rounded-lg border-[3px] border-border bg-secondary px-4 py-2 font-display text-lg text-secondary-foreground shadow-[4px_4px_0_0_var(--ink)]">
          BUY WITH ETH / SOL
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-[480px] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl uppercase">Buy from another chain</DialogTitle>
          <DialogDescription className="font-body">
            Pay from Solana, Ethereum, Base, Arbitrum, BSC, Optimism, Polygon, Avalanche, HyperEVM or Monad — you receive SUI on Sui in seconds.
            Then swap SUI → $BLAST{" "}
            <a href={blastUrl} target="_blank" rel="noreferrer" className="text-primary underline">on Bluefin</a>
            {" "}or with @Ourblastbot (steps below).
          </DialogDescription>
          <AutoSwapPanel />
          <details className="rounded-lg border-2 border-border bg-muted p-3 font-body text-sm">
            <summary className="cursor-pointer font-display uppercase">Manual: swap with @Ourblastbot</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Find your OurBank deposit address: tweet <code>@Ourblastbot show my wallet</code>.</li>
              <li>In the swap below, paste that OurBank address as the Sui destination.</li>
              <li>Wait until the SUI arrives, then tweet <code>@Ourblastbot buy 5 SUI of $BLAST</code>.</li>
            </ol>
          </details>
        </DialogHeader>
        {state === "loading" && <p className="font-body text-sm text-muted-foreground">Loading swap…</p>}
        {state === "error" && (
          <p className="font-body text-sm text-destructive">
            Couldn't load the swap. Try again, or open{" "}
            <a href="https://swap.mayan.finance" target="_blank" rel="noreferrer" className="underline">swap.mayan.finance</a>.
          </p>
        )}
        <div id={ROOT_ID} className="min-h-[520px] w-full" />
        <div className="rounded-lg border-2 border-border bg-muted p-3 font-body text-sm">
          <p className="mb-1 font-display uppercase">Coming from NEAR or Robinhood Chain?</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><b>NEAR:</b> swap NEAR straight to SUI on <a href={ALTERNATE_ROUTES.near.url} target="_blank" rel="noreferrer" className="text-primary underline">NEAR Intents</a> and send it to your OurBank address above.</li>
            <li><b>Robinhood Chain:</b> move ETH/USDC to Arbitrum or Base with <a href={ALTERNATE_ROUTES.robinhood.url} target="_blank" rel="noreferrer" className="text-primary underline">Relay</a> (seconds), then use the swap here.</li>
          </ul>
        </div>
        <p className="font-body text-xs text-muted-foreground">
          Powered by Mayan. You sign with your own wallet; OURBLAST never holds your funds. Use a Sui address you control as the destination.
        </p>
      </DialogContent>
    </Dialog>
  );
}

type Order = Awaited<ReturnType<typeof getCrossChainOrder>>;

function AutoSwapPanel() {
  const start = useServerFn(startCrossChainOrder);
  const check = useServerFn(getCrossChainOrder);
  const [address, setAddress] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<Order>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    const timer = setInterval(async () => {
      const next = await check({ data: { id: orderId } }).catch(() => null);
      if (next) setOrder(next);
      if (next && next.status !== "pending" && next.status !== "swapping") clearInterval(timer);
    }, 8000);
    return () => clearInterval(timer);
  }, [orderId, check]);

  const arm = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { setError("Sign in with X on the Terminal page first, then come back."); return; }
      const res = await start({ data: {} });
      if (!res.ok) { setError(res.error); return; }
      setAddress(res.address);
      setOrderId(res.id);
      setOrder(null);
    } catch {
      setError("Couldn't start auto-swap. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const status = order?.status ?? (orderId ? "pending" : null);
  return (
    <div className="rounded-lg border-2 border-primary bg-muted p-3 font-body text-sm">
      <p className="mb-2 font-display uppercase">One-shot: auto-swap into $BLAST</p>
      {!address ? (
        <>
          <p className="mb-2">Get your OurBank address, bridge to it below, and we swap the SUI into $BLAST the moment it lands.</p>
          <button type="button" onClick={arm} disabled={busy} className="rounded-md border-2 border-border bg-primary px-3 py-1 font-display text-primary-foreground">
            {busy ? "Preparing…" : "Get my address + auto-swap"}
          </button>
        </>
      ) : (
        <>
          <p className="mb-1">Paste this as the Sui destination in the swap below:</p>
          <button type="button" onClick={() => navigator.clipboard.writeText(address)} className="w-full break-all rounded-md border-2 border-border bg-background p-2 text-left font-mono text-xs">
            {address} <span className="text-primary">(tap to copy)</span>
          </button>
          <p className="mt-2">
            {status === "pending" && "Waiting for your SUI to arrive… (open for 45 min)"}
            {status === "swapping" && "SUI received — swapping into $BLAST…"}
            {status === "completed" && order?.tx_digest && (
              <>Done! <a className="text-primary underline" href={`https://suiscan.xyz/mainnet/tx/${order.tx_digest}`} target="_blank" rel="noreferrer">View transaction</a></>
            )}
            {status === "failed" && `Swap didn't go through — your SUI is safe in OurBank. ${order?.error ?? ""}`}
            {status === "expired" && "No deposit arrived in time. Start again when you're ready."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Needs at least 0.1 SUI; 0.05 SUI stays for network fees.</p>
        </>
      )}
      {error && <p className="mt-2 text-destructive">{error}</p>}
    </div>
  );
}
