CREATE TABLE public.launcher_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  default_launchpad text NOT NULL DEFAULT 'suipump',
  ourblast_fee_percent numeric NOT NULL DEFAULT 10 CHECK (ourblast_fee_percent >= 0 AND ourblast_fee_percent <= 50),
  dev_buy_enabled boolean NOT NULL DEFAULT false,
  auto_launch_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.launcher_settings TO anon;
GRANT SELECT ON public.launcher_settings TO authenticated;
GRANT ALL ON public.launcher_settings TO service_role;
ALTER TABLE public.launcher_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "launcher settings are public" ON public.launcher_settings FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.launcher_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.x_launch_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  x_post_id text NOT NULL UNIQUE,
  x_username text NOT NULL,
  symbol text NOT NULL,
  name text NOT NULL,
  launchpad text NOT NULL DEFAULT 'suipump',
  dev_buy boolean NOT NULL DEFAULT false,
  ourblast_fee_percent numeric NOT NULL DEFAULT 10,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','LAUNCHING','DEPLOYED','FAILED','UNAVAILABLE')),
  token_address text,
  token_url text,
  pool_url text,
  tx_digest text,
  reply_post_id text,
  deployed_reply_post_id text,
  notice text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.x_launch_requests TO anon;
GRANT SELECT ON public.x_launch_requests TO authenticated;
GRANT ALL ON public.x_launch_requests TO service_role;
ALTER TABLE public.x_launch_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "launch requests are public" ON public.x_launch_requests FOR SELECT TO anon, authenticated USING (true);
CREATE INDEX x_launch_requests_created_idx ON public.x_launch_requests (created_at DESC);