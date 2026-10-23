CREATE TABLE public.tg_webhook_receipts (
  delivery_key text PRIMARY KEY,
  update_id bigint NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.tg_webhook_receipts TO service_role;
ALTER TABLE public.tg_webhook_receipts ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.tg_webhook_receipts IS 'Service-role-only at-most-once Telegram delivery and confirmation claims; never replay a claimed spend.';
CREATE INDEX tg_webhook_receipts_received_at_idx ON public.tg_webhook_receipts (received_at);