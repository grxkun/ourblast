ALTER TABLE public.bank_transfers REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bank_transfers;