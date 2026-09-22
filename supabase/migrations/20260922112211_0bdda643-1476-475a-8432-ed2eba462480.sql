CREATE TABLE public.creator_fee_designations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_address text NOT NULL,
  chain text NOT NULL DEFAULT 'sui',
  launchpad text NOT NULL DEFAULT 'suipump',
  token_symbol text NOT NULL,
  token_name text,
  deployer_user_id uuid NOT NULL,
  deployer_wallet text,
  recipient_wallet text NOT NULL,
  recipient_name text,
  recipient_x_handle text,
  authorized boolean NOT NULL DEFAULT false,
  designated_at timestamp with time zone NOT NULL DEFAULT now(),
  designation_tx text,
  unclaimed_amount numeric NOT NULL DEFAULT 0,
  claimed_amount numeric NOT NULL DEFAULT 0,
  trading_volume numeric NOT NULL DEFAULT 0,
  claim_tx text,
  claimed_at timestamp with time zone,
  claimed_wallet text,
  status text NOT NULL DEFAULT 'designated',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT creator_fee_designations_token_unique UNIQUE (token_address),
  CONSTRAINT creator_fee_designations_status_check CHECK (status IN ('designated','claimable','claimed'))
);

GRANT SELECT ON public.creator_fee_designations TO anon;
GRANT SELECT, INSERT ON public.creator_fee_designations TO authenticated;
GRANT ALL ON public.creator_fee_designations TO service_role;

ALTER TABLE public.creator_fee_designations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designations are publicly readable"
ON public.creator_fee_designations FOR SELECT
USING (true);

CREATE POLICY "Deployers create their own designations"
ON public.creator_fee_designations FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = deployer_user_id);

CREATE INDEX creator_fee_designations_unclaimed_idx
ON public.creator_fee_designations (unclaimed_amount DESC);

CREATE TRIGGER touch_creator_fee_designations
BEFORE UPDATE ON public.creator_fee_designations
FOR EACH ROW EXECUTE FUNCTION public.touch_blast_build_updated_at();