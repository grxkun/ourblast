CREATE TABLE public.sui_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('game','chat')),
  digest text NOT NULL UNIQUE,
  sender text NOT NULL,
  recipient text NOT NULL,
  amount_mist bigint NOT NULL,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sui_payments TO authenticated;
GRANT ALL ON public.sui_payments TO service_role;
ALTER TABLE public.sui_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_read_own" ON public.sui_payments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE INDEX sui_payments_user_purpose_idx ON public.sui_payments (user_id, purpose, consumed_at);

CREATE TABLE public.seasons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.seasons TO anon;
GRANT SELECT ON public.seasons TO authenticated;
GRANT ALL ON public.seasons TO service_role;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seasons_public_read" ON public.seasons FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "seasons_admin_write" ON public.seasons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.seasons (name, starts_on, is_current) VALUES ('Season 1 — Helmets On', CURRENT_DATE, true);

ALTER TABLE public.game_sessions ADD COLUMN payment_id uuid REFERENCES public.sui_payments(id);
ALTER TABLE public.game_sessions ADD COLUMN season_id uuid REFERENCES public.seasons(id);
ALTER TABLE public.chat_messages ADD COLUMN payment_id uuid REFERENCES public.sui_payments(id);