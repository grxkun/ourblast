CREATE TABLE public.gas_reserve (
  id boolean NOT NULL DEFAULT true PRIMARY KEY CHECK (id),
  address text NOT NULL,
  secret_ciphertext text NOT NULL,
  contributed_sui numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.gas_reserve TO service_role;
ALTER TABLE public.gas_reserve ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gas_reserve_service_only" ON public.gas_reserve FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.gas_reserve_contributions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  amount_sui numeric NOT NULL,
  source text NOT NULL,
  reference text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.gas_reserve_contributions TO service_role;
ALTER TABLE public.gas_reserve_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gas_reserve_contributions_service_only" ON public.gas_reserve_contributions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER touch_gas_reserve BEFORE UPDATE ON public.gas_reserve FOR EACH ROW EXECUTE FUNCTION public.touch_blast_build_updated_at();