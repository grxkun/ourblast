CREATE TABLE public.tg_notifier_observations (
 coin_type text NOT NULL,
 observed_at timestamptz NOT NULL,
 price_usd double precision,
 progress double precision,
 reserve_sui double precision,
 symbol text NOT NULL,
 PRIMARY KEY (coin_type, observed_at)
);
GRANT ALL ON public.tg_notifier_observations TO service_role;
ALTER TABLE public.tg_notifier_observations ENABLE ROW LEVEL SECURITY;
CREATE INDEX tg_notifier_observations_time ON public.tg_notifier_observations(observed_at);
CREATE TABLE public.tg_notifier_monitors (
 coin_type text PRIMARY KEY,
 source text NOT NULL,
 checked_at timestamptz NOT NULL DEFAULT '1970-01-01',
 last_progress double precision,
 migrated boolean NOT NULL DEFAULT false
);
GRANT ALL ON public.tg_notifier_monitors TO service_role;
ALTER TABLE public.tg_notifier_monitors ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.tg_notifier_signal_deliveries (
 channel text NOT NULL,
 signal_key text NOT NULL,
 kind text NOT NULL,
 status text NOT NULL DEFAULT 'sending',
 message_id bigint,
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(channel, signal_key)
);
GRANT ALL ON public.tg_notifier_signal_deliveries TO service_role;
ALTER TABLE public.tg_notifier_signal_deliveries ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.tg_notifier_listener (
 id text PRIMARY KEY,
 lease_until timestamptz NOT NULL DEFAULT '1970-01-01',
 owner uuid,
 started_at timestamptz NOT NULL DEFAULT now(),
 last_completed_at timestamptz,
 error text
);
GRANT ALL ON public.tg_notifier_listener TO service_role;
ALTER TABLE public.tg_notifier_listener ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.claim_notifier_listener(p_owner uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 INSERT INTO public.tg_notifier_listener(id) VALUES ('channel') ON CONFLICT DO NOTHING;
 UPDATE public.tg_notifier_listener SET owner=p_owner,lease_until=now()+interval '120 seconds' WHERE id='channel' AND lease_until<now();
 RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_notifier_listener(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notifier_listener(uuid) TO service_role;