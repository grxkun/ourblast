DROP POLICY IF EXISTS "Signed-in users can read the X mention inbox" ON public.x_mentions;
DROP POLICY IF EXISTS "X mentions are public" ON public.x_mentions;
CREATE POLICY "Staff can read the X mention inbox" ON public.x_mentions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
REVOKE SELECT ON public.x_mentions FROM anon;

REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, wallet_address, nickname, avatar_seed, points, games_played, best_score, streak, last_login_day, is_banned, muted_until, created_at, updated_at, auth_provider, display_name, avatar_url) ON public.profiles TO anon, authenticated;