const ITEMS = [
  "$CTO",
  "COMMUNITY TAKEOVER",
  "HELMETS ON",
  "LP BURNED",
  "0 / 0 TAX",
  "NO DEV WALLET",
  "LIVE ON BLAST.FUN",
];

export function Ticker() {
  const row = [...ITEMS, ...ITEMS];

  return (
    <div className="overflow-hidden border-y-[3px] border-border bg-secondary py-3">
      <div className="animate-ticker flex w-max whitespace-nowrap">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0">
            {row.map((item, i) => (
              <span
                key={`${copy}-${i}`}
                className="flex items-center gap-6 px-6 font-display text-xl tracking-wide text-secondary-foreground"
              >
                {item}
                <span className="text-primary">◆</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
