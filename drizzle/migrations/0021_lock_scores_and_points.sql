DROP POLICY IF EXISTS builders_owner_update ON public.builders;
REVOKE UPDATE ON public.builders FROM authenticated, anon;
REVOKE UPDATE ON public.profiles FROM authenticated, anon;
GRANT UPDATE (nickname, avatar_url) ON public.profiles TO authenticated;