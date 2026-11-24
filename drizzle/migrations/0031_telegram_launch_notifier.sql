CREATE TABLE public.tg_launch_notifier_state (
 channel text PRIMARY KEY,
 started_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.tg_launch_notifier_state TO service_role;
ALTER TABLE public.tg_launch_notifier_state ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.tg_launch_notifications (
 channel text NOT NULL,
 coin_type text NOT NULL,
 launched_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','uncertain')),
 message_id bigint,
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (channel, coin_type)
);
GRANT ALL ON public.tg_launch_notifications TO service_role;
ALTER TABLE public.tg_launch_notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX tg_launch_notifications_pending ON public.tg_launch_notifications(channel, launched_at) WHERE status = 'pending';