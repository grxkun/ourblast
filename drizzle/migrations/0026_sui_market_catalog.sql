CREATE TABLE public.sui_market_catalog (
 coin_type text PRIMARY KEY,
 symbol text NOT NULL,
 name text NOT NULL DEFAULT '',
 source text NOT NULL,
 launched_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sui_market_catalog TO anon, authenticated;
GRANT ALL ON public.sui_market_catalog TO service_role;
ALTER TABLE public.sui_market_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public token catalog reads" ON public.sui_market_catalog FOR SELECT TO anon, authenticated USING (true);
CREATE INDEX sui_market_catalog_launch_idx ON public.sui_market_catalog (launched_at DESC NULLS LAST);
CREATE INDEX sui_market_catalog_source_idx ON public.sui_market_catalog (source);