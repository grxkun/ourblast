ALTER TABLE public.x_bot_state
  ADD COLUMN IF NOT EXISTS pause_anchor_at timestamptz,
  ADD COLUMN IF NOT EXISTS pause_anchor_raw text,
  ADD COLUMN IF NOT EXISTS last_evm_scan_at timestamptz;

CREATE TABLE public.evm_sweeps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  x_username text NOT NULL,
  user_id uuid,
  evm_address text NOT NULL,
  chain text NOT NULL,
  token text NOT NULL,
  amount_atomic numeric NOT NULL,
  route text NOT NULL,
  status text NOT NULL DEFAULT 'sending',
  approve_tx text,
  tx_hash text,
  order_id uuid,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX evm_sweeps_one_inflight ON public.evm_sweeps (evm_address, chain, token) WHERE status IN ('sending','submitted');
CREATE INDEX evm_sweeps_user ON public.evm_sweeps (user_id, created_at DESC);
GRANT SELECT ON public.evm_sweeps TO authenticated;
GRANT ALL ON public.evm_sweeps TO service_role;
ALTER TABLE public.evm_sweeps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own EVM sweeps" ON public.evm_sweeps FOR SELECT TO authenticated USING (user_id = auth.uid());