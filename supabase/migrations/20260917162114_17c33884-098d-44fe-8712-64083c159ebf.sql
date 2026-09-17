INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'admin'::app_role
FROM public.profiles p
WHERE lower(p.wallet_address) = lower('0x5072270dc6285923416008d93923cfae1cf8236b72ac8d101692335e139b4886')
ON CONFLICT (user_id, role) DO NOTHING;