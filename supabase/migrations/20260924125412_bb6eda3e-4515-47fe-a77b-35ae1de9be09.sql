CREATE TABLE public.bank_swaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  x_post_id text NOT NULL UNIQUE,
  x_username text NOT NULL,
  wallet text NOT NULL,
  side text NOT NULL CHECK (side IN ('buy','sell')),
  coin_in text NOT NULL,
  coin_out text NOT NULL,
  amount_in text NOT NULL,
  quoted_out text,
  status text NOT NULL DEFAULT 'SUBMITTED',
  tx_digest text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bank_swaps TO service_role;
ALTER TABLE public.bank_swaps ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER touch_bank_swaps BEFORE UPDATE ON public.bank_swaps FOR EACH ROW EXECUTE FUNCTION public.touch_blast_build_updated_at();

CREATE TABLE public.bank_choices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  x_username text NOT NULL,
  x_post_id text NOT NULL UNIQUE,
  command_text text NOT NULL,
  options jsonb NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '1 hour',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bank_choices_user_idx ON public.bank_choices (x_username, created_at DESC);
GRANT ALL ON public.bank_choices TO service_role;
ALTER TABLE public.bank_choices ENABLE ROW LEVEL SECURITY;