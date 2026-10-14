CREATE TABLE public.funded_launches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  x_username text NOT NULL,
  x_post_id text NOT NULL UNIQUE,
  launch_request_id uuid NOT NULL,
  symbol text NOT NULL,
  launchpad text NOT NULL,
  asset text NOT NULL,
  amount numeric NOT NULL,
  sui_address text NOT NULL,
  status text NOT NULL DEFAULT 'staged',
  bridge_tx text,
  notice text,
  expires_at timestamptz NOT NULL,
  bridged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX funded_launches_user ON public.funded_launches (user_id, created_at DESC);
CREATE INDEX funded_launches_status ON public.funded_launches (status);
GRANT SELECT ON public.funded_launches TO authenticated;
GRANT ALL ON public.funded_launches TO service_role;
ALTER TABLE public.funded_launches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own funded launches" ON public.funded_launches FOR SELECT TO authenticated USING (user_id = auth.uid());