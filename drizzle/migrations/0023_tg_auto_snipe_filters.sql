CREATE TABLE public.tg_snipe_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_user_id bigint NOT NULL,
  launchpads text[] NOT NULL DEFAULT ARRAY['blast','suipump'],
  keyword text,
  amount numeric NOT NULL,
  daily_cap numeric NOT NULL,
  slippage numeric NOT NULL DEFAULT 10,
  slots integer[] NOT NULL DEFAULT ARRAY[1],
  active boolean NOT NULL DEFAULT true,
  spent_day date,
  spent numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tg_snipe_filters_user ON public.tg_snipe_filters(tg_user_id);
GRANT ALL ON public.tg_snipe_filters TO service_role;
ALTER TABLE public.tg_snipe_filters ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tg_snipe_fills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filter_id uuid NOT NULL REFERENCES public.tg_snipe_filters(id) ON DELETE CASCADE,
  coin_type text NOT NULL,
  result text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (filter_id, coin_type)
);
GRANT ALL ON public.tg_snipe_fills TO service_role;
ALTER TABLE public.tg_snipe_fills ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tg_snipe_cursor (
  source text PRIMARY KEY,
  last_ts timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.tg_snipe_cursor TO service_role;
ALTER TABLE public.tg_snipe_cursor ENABLE ROW LEVEL SECURITY;