ALTER TABLE public.x_launch_requests
  ADD COLUMN IF NOT EXISTS fee_receiver_x_username text,
  ADD COLUMN IF NOT EXISTS fee_receiver_wallet text;