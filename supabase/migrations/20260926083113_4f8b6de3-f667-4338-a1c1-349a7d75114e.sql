ALTER TABLE public.bank_wallets
  ADD COLUMN IF NOT EXISTS signing_backend text NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS turnkey_key_id text,
  ADD COLUMN IF NOT EXISTS turnkey_public_key text,
  ALTER COLUMN secret_ciphertext DROP NOT NULL;

ALTER TABLE public.bank_wallets
  ADD CONSTRAINT bank_wallets_signing_backend_check
  CHECK (signing_backend IN ('local', 'turnkey'));