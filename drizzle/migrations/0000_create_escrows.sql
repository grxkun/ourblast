CREATE TABLE public.escrows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  x_post_id text NOT NULL UNIQUE,
  party_a text NOT NULL,
  party_b text NOT NULL,
  a_coin_type text NOT NULL,
  a_symbol text NOT NULL,
  a_decimals integer NOT NULL,
  a_amount_atomic numeric NOT NULL,
  b_coin_type text NOT NULL,
  b_symbol text NOT NULL,
  b_decimals integer NOT NULL,
  b_amount_atomic numeric NOT NULL,
  escrow_handle text NOT NULL UNIQUE,
  escrow_address text NOT NULL,
  fee_bps integer NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'AWAITING_DEPOSITS',
  tx_digest text,
  error text,
  reply_post_id text,
  final_reply_post_id text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.escrows TO service_role;
ALTER TABLE public.escrows ENABLE ROW LEVEL SECURITY;
CREATE INDEX escrows_open_idx ON public.escrows (status) WHERE status IN ('AWAITING_DEPOSITS','SETTLING','REFUNDING');
CREATE TRIGGER touch_escrows BEFORE UPDATE ON public.escrows FOR EACH ROW EXECUTE FUNCTION public.touch_blast_build_updated_at();