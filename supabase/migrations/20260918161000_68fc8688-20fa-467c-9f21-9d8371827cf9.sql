CREATE TABLE public.launch_fee_payouts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  launch_symbol text NOT NULL,
  launchpad text NOT NULL,
  mode text NOT NULL DEFAULT 'creator' CHECK (mode IN ('creator', 'wallet', 'x')),
  destination_wallet text,
  destination_x_username text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, launch_symbol)
);

GRANT SELECT, INSERT, UPDATE ON public.launch_fee_payouts TO authenticated;
GRANT ALL ON public.launch_fee_payouts TO service_role;
ALTER TABLE public.launch_fee_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payouts_select_own" ON public.launch_fee_payouts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "payouts_insert_own" ON public.launch_fee_payouts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "payouts_update_own" ON public.launch_fee_payouts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "payouts_service" ON public.launch_fee_payouts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER touch_launch_fee_payouts BEFORE UPDATE ON public.launch_fee_payouts FOR EACH ROW EXECUTE FUNCTION public.touch_blast_build_updated_at();

CREATE TABLE public.fee_claim_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token text NOT NULL UNIQUE,
  launch_symbol text NOT NULL,
  x_username text NOT NULL,
  amount_sui numeric NOT NULL DEFAULT 0,
  created_by uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'expired')),
  claimed_wallet text,
  claimed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.fee_claim_links TO service_role;
ALTER TABLE public.fee_claim_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fee_claim_links_service" ON public.fee_claim_links FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER touch_fee_claim_links BEFORE UPDATE ON public.fee_claim_links FOR EACH ROW EXECUTE FUNCTION public.touch_blast_build_updated_at();

CREATE INDEX idx_fee_claim_links_username ON public.fee_claim_links (lower(x_username));