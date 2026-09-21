ALTER TABLE public.x_launch_requests
  ADD COLUMN IF NOT EXISTS underlying text,
  ADD COLUMN IF NOT EXISTS perps_long boolean,
  ADD COLUMN IF NOT EXISTS leverage_bps integer,
  ADD COLUMN IF NOT EXISTS starting_cap_usd numeric;