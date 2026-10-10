REVOKE UPDATE ON public.profiles FROM authenticated, anon;
GRANT UPDATE (nickname) ON public.profiles TO authenticated;