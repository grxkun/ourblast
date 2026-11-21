ALTER TABLE public.tg_limit_orders ADD COLUMN IF NOT EXISTS stop boolean NOT NULL DEFAULT false;
ALTER TABLE public.tg_limit_orders ADD COLUMN IF NOT EXISTS oco uuid;
ALTER TABLE public.tg_snipe_filters ADD COLUMN IF NOT EXISTS tp_pct numeric;
ALTER TABLE public.tg_snipe_filters ADD COLUMN IF NOT EXISTS sl_pct numeric;