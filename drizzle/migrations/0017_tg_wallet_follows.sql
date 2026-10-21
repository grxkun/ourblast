CREATE TABLE public.tg_wallet_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_user_id bigint NOT NULL,
  address text NOT NULL,
  label text,
  last_digest text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tg_user_id, address)
);
GRANT ALL ON public.tg_wallet_follows TO service_role;
ALTER TABLE public.tg_wallet_follows ENABLE ROW LEVEL SECURITY;
