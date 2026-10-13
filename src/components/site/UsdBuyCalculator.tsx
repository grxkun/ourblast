// SPDX-License-Identifier: BUSL-1.1
import { useEffect, useState } from "react";

const BLAST = "0x577a8addf60a34d4c705914ad066a3b28c3fc40d365ed0d9dfc408f29b4725d3::blast::BLAST";
const ASSETS = [
  { id: "ethereum", label: "ETH" },
  { id: "solana", label: "SOL" },
  { id: "binancecoin", label: "BNB" },
  { id: "usd-coin", label: "USDC" },
] as const;
const PRESETS = [5, 10, 25, 50, 100];

type Prices = Record<string, number>;

/** Shows how much of each source asset to send for a USD amount, and the ≈ $BLAST received. Estimates only. */
export function UsdBuyCalculator() {
  const [usd, setUsd] = useState("10");
  const [prices, setPrices] = useState<Prices | null>(null);
  const [blastUsd, setBlastUsd] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ids = ASSETS.map((a) => a.id).join(",");
    fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`)
      .then((r) => r.json())
      .then((j: Record<string, { usd: number }>) => setPrices(Object.fromEntries(Object.entries(j).map(([k, v]) => [k, v.usd]))))
      .catch(() => setFailed(true));
    fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(BLAST)}`)
      .then((r) => r.json())
      .then((j: { pairs?: { priceUsd?: string; liquidity?: { usd?: number } }[] }) => {
        const best = (j.pairs ?? []).filter((p) => p.priceUsd).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
        if (best?.priceUsd) setBlastUsd(Number(best.priceUsd));
      })
      .catch(() => undefined);
  }, []);

  const amount = Math.max(0, Number(usd) || 0);
  const fmt = (n: number) => (n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toPrecision(4));

  return (
    <div className="rounded-lg border-2 border-primary bg-card p-4 font-body text-sm">
      <p className="mb-2 font-display uppercase">Buy by USD amount</p>
      <div className="flex items-center gap-2">
        <span className="font-display text-2xl">$</span>
        <input
          type="number"
          inputMode="decimal"
          min={1}
          value={usd}
          onChange={(e) => setUsd(e.target.value)}
          aria-label="Amount in USD"
          className="w-full rounded-md border-2 border-border bg-background p-2 font-mono text-lg"
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p} type="button" onClick={() => setUsd(String(p))} className="rounded-md border-2 border-border bg-secondary px-3 py-1 font-display text-secondary-foreground">
            ${p}
          </button>
        ))}
      </div>
      {blastUsd ? (
        <p className="mt-3 font-display text-lg">≈ {fmt(amount / blastUsd)} $BLAST</p>
      ) : null}
      <p className="mt-3 mb-1 text-xs text-muted-foreground">Send about this much from your chain:</p>
      {prices ? (
        <ul className="grid grid-cols-2 gap-2">
          {ASSETS.map((a) => (
            <li key={a.id} className="rounded-md border-2 border-border bg-background p-2 font-mono text-xs">
              {prices[a.id] ? `${fmt(amount / prices[a.id])} ${a.label}` : `— ${a.label}`}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{failed ? "Prices unavailable right now." : "Loading prices…"}</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">Estimates. Bridge fees, 0.05 SUI gas reserve and slippage (up to 5%) reduce the final amount. Enter the matching amount in the swap below.</p>
    </div>
  );
}
