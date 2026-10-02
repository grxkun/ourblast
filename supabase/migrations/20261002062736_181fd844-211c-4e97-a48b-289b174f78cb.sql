ALTER TABLE public.x_launch_requests
  ADD COLUMN IF NOT EXISTS maelstrom_launch_id text NULL,
  ADD COLUMN IF NOT EXISTS fees_paid_coin numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fees_paid_quote numeric NOT NULL DEFAULT 0;