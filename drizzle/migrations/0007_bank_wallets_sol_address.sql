ALTER TABLE public.bank_wallets
  ADD COLUMN IF NOT EXISTS sol_address text,
  ADD COLUMN IF NOT EXISTS sol_secret_ciphertext text,
  ADD COLUMN IF NOT EXISTS sol_signing_backend text,
  ADD COLUMN IF NOT EXISTS sol_turnkey_wallet_id text;
CREATE UNIQUE INDEX IF NOT EXISTS bank_wallets_sol_address_key ON public.bank_wallets (sol_address) WHERE sol_address IS NOT NULL;