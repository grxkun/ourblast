const COIN =
  "0x577a8addf60a34d4c705914ad066a3b28c3fc40d365ed0d9dfc408f29b4725d3::blast::BLAST";

const WIDGET_URL = `https://noodles.fi/tv-widget?coin=${encodeURIComponent(COIN)}&theme=light`;
const NOODLES_URL = `https://app.noodles.fi/coins/${COIN}`;

export function BlastChart() {
  return (
    <section id="chart" className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-body text-xs font-bold tracking-[0.22em] text-primary uppercase">
            Live chart
          </p>
          <h2 className="mt-3 font-display text-[clamp(2.2rem,6vw,4rem)] leading-none tracking-tight uppercase">
            $BLAST price, live
          </h2>
        </div>
        <a
          href={NOODLES_URL}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border-[3px] border-border bg-card px-4 py-2 font-display text-lg tracking-wide shadow-[4px_4px_0_0_var(--ink)] transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
        >
          OPEN ON NOODLES
        </a>
      </div>

      <div className="mt-8 overflow-hidden rounded-3xl border-[3px] border-border bg-card shadow-[var(--shadow-sticker-lg)]">
        <iframe
          src={WIDGET_URL}
          title="$BLAST live price chart on Noodles.fi"
          loading="lazy"
          allowFullScreen
          className="block h-[380px] w-full border-0 sm:h-[520px]"
        />
      </div>
      <p className="mt-4 font-body text-sm text-muted-foreground">
        Chart data by Noodles.fi. If it doesn't load, open it on Noodles directly.
      </p>
    </section>
  );
}
