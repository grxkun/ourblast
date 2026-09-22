ALTER TABLE public.creator_fee_designations
  DROP CONSTRAINT IF EXISTS creator_fee_designations_status_check;
ALTER TABLE public.creator_fee_designations
  ADD CONSTRAINT creator_fee_designations_status_check
  CHECK (status = ANY (ARRAY['designated'::text, 'claimable'::text, 'claimed'::text, 'recalled'::text]));
ALTER TABLE public.creator_fee_designations
  ADD COLUMN IF NOT EXISTS recalled_at timestamptz;

ALTER TABLE public.fee_claim_links
  DROP CONSTRAINT IF EXISTS fee_claim_links_status_check;
ALTER TABLE public.fee_claim_links
  ADD CONSTRAINT fee_claim_links_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'claimed'::text, 'expired'::text, 'revoked'::text]));