ALTER TABLE public.x_mentions
  ADD COLUMN IF NOT EXISTS reply_post_id text,
  ADD COLUMN IF NOT EXISTS post_error text,
  ADD COLUMN IF NOT EXISTS posted_at timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.x_bot_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  last_mention_id text,
  bot_user_id text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.x_bot_state TO service_role;
ALTER TABLE public.x_bot_state ENABLE ROW LEVEL SECURITY;

INSERT INTO public.x_bot_state (id) VALUES (true) ON CONFLICT (id) DO NOTHING;