ALTER TABLE public.tg_webhook_receipts ADD COLUMN payload jsonb;
ALTER TABLE public.tg_webhook_receipts ADD COLUMN status text NOT NULL DEFAULT 'done';
ALTER TABLE public.tg_webhook_receipts ADD COLUMN completed_at timestamptz;
CREATE INDEX tg_webhook_receipts_pending_idx ON public.tg_webhook_receipts (received_at) WHERE status = 'pending';
COMMENT ON COLUMN public.tg_webhook_receipts.status IS 'pending jobs may be claimed atomically; processing jobs must never auto-replay because a transaction may have been submitted.';