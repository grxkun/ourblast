INSERT INTO public.daily_challenges (day, title, description, target, reward_points)
SELECT d::date,
  (ARRAY['SCORE 3,000 IN ONE RUN','HIT A x8 COMBO','PLAY 3 RUNS TODAY','BEAT YOUR OWN BEST SCORE','SCORE 5,000 IN ONE RUN','LAND 200 CLICKS TODAY','KEEP A x10 COMBO ALIVE'])[1 + (extract(doy from d)::int % 7)],
  'Complete today''s mission in BLAST CLICK to bank the bonus points.',
  (ARRAY[3000,8,3,1,5000,200,10])[1 + (extract(doy from d)::int % 7)],
  500
FROM generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', INTERVAL '1 day') AS d
ON CONFLICT (day) DO NOTHING;