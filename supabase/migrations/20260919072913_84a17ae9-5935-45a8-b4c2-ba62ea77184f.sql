ALTER TABLE public.profiles ALTER COLUMN wallet_address DROP NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS auth_provider text NOT NULL DEFAULT 'wallet';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS social_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_auth_provider_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_auth_provider_check CHECK (auth_provider IN ('wallet','google','x'));
CREATE UNIQUE INDEX IF NOT EXISTS profiles_social_identity_key ON public.profiles (auth_provider, social_id) WHERE social_id IS NOT NULL;

ALTER TABLE public.x_oauth_states ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.x_oauth_states ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'connect';
ALTER TABLE public.x_oauth_states DROP CONSTRAINT IF EXISTS x_oauth_states_purpose_check;
ALTER TABLE public.x_oauth_states ADD CONSTRAINT x_oauth_states_purpose_check CHECK (purpose IN ('connect','login'));