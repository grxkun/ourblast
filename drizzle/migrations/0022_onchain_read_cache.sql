CREATE TABLE public.coin_metadata_cache (coin_type text PRIMARY KEY, symbol text NOT NULL, decimals integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.coin_metadata_cache TO service_role;
ALTER TABLE public.coin_metadata_cache ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.tx_activity_cache (tg_user_id bigint PRIMARY KEY, items jsonb NOT NULL DEFAULT '[]'::jsonb, refreshed_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.tx_activity_cache TO service_role;
ALTER TABLE public.tx_activity_cache ENABLE ROW LEVEL SECURITY;