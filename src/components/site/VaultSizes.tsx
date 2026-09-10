import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getVaultSizes, type Holding } from "@/lib/vault.functions";
import { PRIZE_POOL_ADDRESS, DEFAULT_TREASURY_ADDRESS } from "@/lib/ourblast.config";

function usd(amount: number): string {
  if (!amount) return "—";
  return `$${amount.toLocaleString(undefined, { maximumFractionDigits: amount < 100 ? 2 : 0 })}`;
}

function amount(value: number): string {
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function VaultSizes() {
  const fetchSizes = useServerFn(getVaultSizes);
  const { data, isPending } = useQuery({
    queryKey: ["vault-sizes"],
    queryFn: () => fetchSizes(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const cards: { label: string; total: number; holdings: Holding[]; address: string; note: string }[] =
    [
      {
        label: "Prize pool",
        total: data?.prizePoolUsd ?? 0,
        holdings: data?.prizePoolHoldings ?? [],
        address: PRIZE_POOL_ADDRESS,
        note: "70% of every arcade round, paid back to winning players.",
      },
      {
        label: "Community treasury",
        total: data?.treasuryUsd ?? 0,
        holdings: data?.treasuryHoldings ?? [],
        address: DEFAULT_TREASURY_ADDRESS,
        note: "20% of every round: events, buybacks, art, hosting.",
      },
    ];

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {cards.map((c) => (
        <div key={c.label} className="ink-box p-6">
          <p className="font-body text-xs font-bold tracking-[0.18em] text-muted-foreground uppercase">
            {c.label}
          </p>
          <p className="mt-3 font-display text-4xl leading-none tracking-wide text-primary">
            {isPending ? "…" : usd(c.total)}
          </p>

          <ul className="mt-4 space-y-1.5 border-t-[3px] border-border pt-4">
            {isPending && <li className="font-body text-sm text-muted-foreground">loading…</li>}
            {!isPending && c.holdings.length === 0 && (
              <li className="font-body text-sm text-muted-foreground">Empty right now</li>
            )}
            {c.holdings.map((h) => (
              <li key={h.coinType} className="flex items-baseline justify-between gap-3">
                <span className="font-body text-sm font-bold">
                  {amount(h.amount)} {h.symbol}
                </span>
                <span className="font-body text-sm text-muted-foreground">
                  {h.priceUsd ? usd(h.valueUsd) : "no price"}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-4 font-body text-sm text-muted-foreground">{c.note}</p>
          <p className="mt-2 font-body text-xs break-all text-muted-foreground">
            {shorten(c.address)}
          </p>
        </div>
      ))}
    </div>
  );
}
