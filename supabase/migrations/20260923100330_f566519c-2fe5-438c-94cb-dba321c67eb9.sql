ALTER TABLE public.x_bot_state
  ADD COLUMN IF NOT EXISTS last_poll_success_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_search_success_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reply_success_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_poll_error TEXT;
CREATE POLICY "Staff can read bot health" ON public.x_bot_state
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));