CREATE TABLE public.bank_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  x_post_id text NOT NULL UNIQUE,
  sender_user_id uuid NOT NULL,
  sender_x_username text NOT NULL,
  sender_wallet text NOT NULL,
  recipient_kind text NOT NULL,
  recipient_input text NOT NULL,
  recipient_address text,
  coin_type text,
  symbol text NOT NULL,
  decimals integer,
  amount_atomic numeric,
  amount_display numeric NOT NULL,
  status text NOT NULL DEFAULT 'PENDING_APPROVAL',
  tx_digest text,
  reply_post_id text,
  confirmed_reply_post_id text,
  error text,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bank_transfers TO authenticated;
GRANT ALL ON public.bank_transfers TO service_role;
ALTER TABLE public.bank_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Senders read own transfers" ON public.bank_transfers FOR SELECT TO authenticated USING (auth.uid() = sender_user_id);
CREATE INDEX bank_transfers_sender_idx ON public.bank_transfers (sender_user_id, created_at DESC);
CREATE TRIGGER touch_bank_transfers BEFORE UPDATE ON public.bank_transfers FOR EACH ROW EXECUTE FUNCTION public.touch_blast_build_updated_at();