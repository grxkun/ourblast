ALTER TABLE public.bank_wallets
  ADD COLUMN IF NOT EXISTS evm_address text,
  ADD COLUMN IF NOT EXISTS evm_secret_ciphertext text,
  ADD COLUMN IF NOT EXISTS evm_signing_backend text,
  ADD COLUMN IF NOT EXISTS evm_turnkey_wallet_id text;
CREATE UNIQUE INDEX IF NOT EXISTS bank_wallets_evm_address_key ON public.bank_wallets (lower(evm_address)) WHERE evm_address IS NOT NULL;