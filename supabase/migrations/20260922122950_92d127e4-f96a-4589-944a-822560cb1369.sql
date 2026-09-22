ALTER TABLE public.fee_claim_links
  ADD COLUMN IF NOT EXISTS slush_url text,
  ADD COLUMN IF NOT EXISTS slush_tx text,
  ADD COLUMN IF NOT EXISTS slush_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS slush_amount_sui numeric NOT NULL DEFAULT 0;