CREATE TABLE public.cross_chain_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  x_username text NOT NULL,
  wallet text NOT NULL,
  target_coin text NOT NULL,
  baseline_sui numeric NOT NULL,
  received_sui numeric,
  swapped_sui numeric,
  received_out numeric,
  status text NOT NULL DEFAULT 'pending',
  tx_digest text,
  error text,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '45 minutes',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cross_chain_orders_status_idx ON public.cross_chain_orders(status);
CREATE INDEX cross_chain_orders_user_idx ON public.cross_chain_orders(user_id, created_at DESC);
GRANT SELECT ON public.cross_chain_orders TO authenticated;
GRANT ALL ON public.cross_chain_orders TO service_role;
ALTER TABLE public.cross_chain_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own cross-chain orders" ON public.cross_chain_orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER touch_cross_chain_orders BEFORE UPDATE ON public.cross_chain_orders FOR EACH ROW EXECUTE FUNCTION public.touch_blast_build_updated_at();