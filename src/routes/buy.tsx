// SPDX-License-Identifier: BUSL-1.1
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CrossChainBuy } from "@/components/site/CrossChainBuy";
import { UsdBuyCalculator } from "@/components/site/UsdBuyCalculator";

const BUY_URL = "https://trade.bluefin.io/swap/SUI-0x577a8addf60a34d4c705914ad066a3b28c3fc40d365ed0d9dfc408f29b4725d3::blast::BLAST";
const SHARE_URL = "https://ourblast.xyz/buy";

export const Route = createFileRoute("/buy")({
  head: () => ({
    meta: [
      { title: "Buy $BLAST from any chain | OURBLAST" },
      { name: "description", content: "One link to buy $BLAST on Sui from Solana, Ethereum, Base, Arbitrum, BSC and more. Bridge in, auto-swap to $BLAST." },
      { property: "og:title", content: "Buy $BLAST from any chain" },
      { property: "og:description", content: "Pay from any chain, receive $BLAST in your OurBank Sui wallet automatically." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuyPage,
});

function BuyPage() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div>
        <p className="font-body text-xs font-bold uppercase text-primary">One link, every chain</p>
        <h1 className="mt-1 font-display text-4xl sm:text-5xl">Buy $BLAST</h1>
      </div>
      <ol className="list-decimal space-y-2 rounded-lg border-2 border-border bg-card p-4 pl-8 font-body text-sm">
        <li>Sign in on the <Link to="/terminal" className="text-primary underline">Terminal</Link> with X, Google, or MetaMask / Rabby.</li>
        <li>Tap the button below, then "Get my address + auto-swap".</li>
        <li>Pay from your chain into that address — SUI or USDC landing there is swapped into $BLAST automatically.</li>
      </ol>
      <UsdBuyCalculator />
      <CrossChainBuy blastUrl={BUY_URL} defaultOpen />
      <div className="rounded-lg border-2 border-border bg-muted p-4 font-body text-sm">
        <p className="mb-2 font-display uppercase">Share this buy link</p>
        <button
          type="button"
          onClick={() => { navigator.clipboard.writeText(SHARE_URL); setCopied(true); }}
          className="w-full break-all rounded-md border-2 border-border bg-background p-2 text-left font-mono text-xs"
        >
          {SHARE_URL} <span className="text-primary">{copied ? "(copied)" : "(tap to copy)"}</span>
        </button>
      </div>
    </div>
  );
}
