ALTER TABLE public.x_bot_state ADD COLUMN IF NOT EXISTS last_sol_scan_at timestamptz;

CREATE TABLE public.sol_sweeps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  x_username text NOT NULL,
  user_id uuid,
  sol_address text NOT NULL,
  token text NOT NULL,
  amount_atomic numeric NOT NULL,
  route text NOT NULL DEFAULT 'near-intents',
  deposit_address text,
  status text NOT NULL DEFAULT 'sending',
  tx_sig text,
  order_id uuid,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sol_sweeps_one_inflight ON public.sol_sweeps (sol_address) WHERE status IN ('sending','submitted');
CREATE INDEX sol_sweeps_user ON public.sol_sweeps (user_id, created_at DESC);
GRANT SELECT ON public.sol_sweeps TO authenticated;
GRANT ALL ON public.sol_sweeps TO service_role;
ALTER TABLE public.sol_sweeps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own SOL sweeps" ON public.sol_sweeps FOR SELECT TO authenticated USING (user_id = auth.uid());