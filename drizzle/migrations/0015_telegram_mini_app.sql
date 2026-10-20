CREATE TABLE public.tg_users (
  tg_user_id bigint PRIMARY KEY,
  username text,
  first_name text,
  photo_url text,
  x_username text,
  privy_user_id text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.tg_users TO service_role;
ALTER TABLE public.tg_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tg_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_user_id bigint NOT NULL REFERENCES public.tg_users(tg_user_id) ON DELETE CASCADE,
  launch_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tg_user_id, launch_id)
);
GRANT ALL ON public.tg_watchlist TO service_role;
ALTER TABLE public.tg_watchlist ENABLE ROW LEVEL SECURITY;