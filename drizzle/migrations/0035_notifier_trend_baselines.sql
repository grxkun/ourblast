CREATE FUNCTION public.notifier_trend_baselines(p_now timestamptz) RETURNS SETOF public.tg_notifier_observations LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH latest AS (
 SELECT DISTINCT ON (coin_type) * FROM public.tg_notifier_observations
 WHERE observed_at BETWEEN p_now-interval '2 minutes' AND p_now
 ORDER BY coin_type,observed_at DESC
 ), bases AS (
 SELECT b.* FROM latest l CROSS JOIN LATERAL (
 SELECT h.* FROM public.tg_notifier_observations h
 WHERE h.coin_type=l.coin_type AND h.price_basis=l.price_basis
 AND h.observed_at BETWEEN l.observed_at-interval '4 hours 2 minutes' AND l.observed_at-interval '3 hours 58 minutes'
 ORDER BY abs(extract(epoch FROM (h.observed_at-(l.observed_at-interval '4 hours')))) LIMIT 1
 ) b
 ) SELECT * FROM latest UNION ALL SELECT * FROM bases;
$$;
REVOKE ALL ON FUNCTION public.notifier_trend_baselines(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.notifier_trend_baselines(timestamptz) TO service_role;