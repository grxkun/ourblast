DROP POLICY IF EXISTS profiles_public_read ON public.profiles;
CREATE POLICY profiles_read_own ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id OR public.is_staff(auth.uid()));

CREATE OR REPLACE VIEW public.public_profiles WITH (security_barrier = true) AS
  SELECT id, wallet_address, nickname, display_name, avatar_seed, avatar_url, points, games_played, best_score, streak, is_banned
  FROM public.profiles;
GRANT SELECT ON public.public_profiles TO anon, authenticated;
GRANT ALL ON public.public_profiles TO service_role;