CREATE TABLE public.bank_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  x_username text NOT NULL UNIQUE,
  user_id uuid,
  address text NOT NULL UNIQUE,
  secret_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bank_wallets TO service_role;
ALTER TABLE public.bank_wallets ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER bank_wallets_touch BEFORE UPDATE ON public.bank_wallets
FOR EACH ROW EXECUTE FUNCTION public.touch_blast_build_updated_at();
ALTER TABLE public.bank_transfers ADD COLUMN IF NOT EXISTS instant boolean NOT NULL DEFAULT false;