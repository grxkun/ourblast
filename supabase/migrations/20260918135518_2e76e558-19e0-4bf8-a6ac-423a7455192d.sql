CREATE TABLE public.x_accounts (
  user_id uuid PRIMARY KEY,
  x_user_id text NOT NULL,
  username text NOT NULL,
  display_name text,
  avatar_url text,
  access_token_ciphertext text NOT NULL,
  refresh_token_ciphertext text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.x_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  code_verifier text NOT NULL,
  redirect_uri text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX x_oauth_states_created_at_idx ON public.x_oauth_states (created_at);

GRANT ALL ON public.x_accounts TO service_role;
GRANT ALL ON public.x_oauth_states TO service_role;
GRANT SELECT ON public.x_accounts TO authenticated;

ALTER TABLE public.x_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.x_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "x_accounts owner read" ON public.x_accounts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "x_oauth_states service role only" ON public.x_oauth_states FOR ALL TO service_role USING (true) WITH CHECK (true);