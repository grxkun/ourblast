CREATE TABLE public.x_blacklist (
  x_username text PRIMARY KEY,
  reason text,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.x_blacklist TO authenticated;
GRANT ALL ON public.x_blacklist TO service_role;
ALTER TABLE public.x_blacklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view blacklist" ON public.x_blacklist FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
INSERT INTO public.x_blacklist (x_username, reason) VALUES ('cybun_agent', 'Abusing the protocol');