
REVOKE ALL ON FUNCTION public.award_points(uuid,integer,text,text,uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.sync_profile_points() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.chat_rate_limit() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.award_points(uuid,integer,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;
