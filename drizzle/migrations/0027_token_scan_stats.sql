CREATE TABLE public.token_scan_stats (
  coin_type text PRIMARY KEY,
  creator text,
  factory text,
  symbol text,
  ath_mcap double precision,
  ath_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.token_scan_stats TO service_role;
ALTER TABLE public.token_scan_stats ENABLE ROW LEVEL SECURITY;
CREATE INDEX token_scan_stats_creator_idx ON public.token_scan_stats (creator);