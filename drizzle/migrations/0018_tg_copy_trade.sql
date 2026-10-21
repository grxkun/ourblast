ALTER TABLE public.tg_wallet_follows
  ADD COLUMN IF NOT EXISTS copy_sui numeric,
  ADD COLUMN IF NOT EXISTS copy_daily_cap numeric,
  ADD COLUMN IF NOT EXISTS copy_slippage numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS copy_day date,
  ADD COLUMN IF NOT EXISTS copy_spent numeric NOT NULL DEFAULT 0;