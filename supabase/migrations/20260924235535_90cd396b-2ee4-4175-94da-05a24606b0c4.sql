CREATE TABLE public.bank_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_wallet text NOT NULL DEFAULT 'ourbank' CHECK (trade_wallet IN ('ourbank','own')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.bank_preferences TO authenticated;
GRANT ALL ON public.bank_preferences TO service_role;
ALTER TABLE public.bank_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own trade wallet" ON public.bank_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own trade wallet" ON public.bank_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own trade wallet" ON public.bank_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER touch_bank_preferences BEFORE UPDATE ON public.bank_preferences FOR EACH ROW EXECUTE FUNCTION public.touch_blast_build_updated_at();

ALTER TABLE public.bank_swaps ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.bank_swaps ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'ourbank';