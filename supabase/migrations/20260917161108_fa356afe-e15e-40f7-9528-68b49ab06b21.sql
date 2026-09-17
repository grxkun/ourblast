CREATE TABLE public.x_mentions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  x_post_id TEXT NOT NULL UNIQUE,
  x_username TEXT NOT NULL,
  text TEXT NOT NULL CHECK (char_length(text) <= 1000),
  intent TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('NOT_CONNECTED','READY','AWAITING_SIGNATURE','SUBMITTING','CONFIRMED','FAILED','NOT_IMPLEMENTED')),
  reply_text TEXT NOT NULL CHECK (char_length(reply_text) <= 600),
  posted BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'webhook',
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.x_mentions TO authenticated;
GRANT ALL ON public.x_mentions TO service_role;

ALTER TABLE public.x_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read the X mention inbox"
ON public.x_mentions FOR SELECT TO authenticated USING (true);

CREATE INDEX x_mentions_created_at_idx ON public.x_mentions (created_at DESC);