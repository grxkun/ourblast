CREATE TABLE public.terminal_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  command text NOT NULL,
  intent text NOT NULL,
  response text NOT NULL,
  status text NOT NULL DEFAULT 'READY',
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT terminal_history_command_length CHECK (char_length(command) BETWEEN 1 AND 500),
  CONSTRAINT terminal_history_response_length CHECK (char_length(response) BETWEEN 1 AND 4000),
  CONSTRAINT terminal_history_status_allowed CHECK (status IN ('NOT_CONNECTED', 'READY', 'AWAITING_SIGNATURE', 'SUBMITTING', 'CONFIRMED', 'FAILED', 'NOT_IMPLEMENTED'))
);

GRANT SELECT, INSERT, DELETE ON public.terminal_history TO authenticated;
GRANT ALL ON public.terminal_history TO service_role;

ALTER TABLE public.terminal_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own terminal history"
ON public.terminal_history
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can add their own terminal history"
ON public.terminal_history
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can clear their own terminal history"
ON public.terminal_history
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX terminal_history_user_created_idx
ON public.terminal_history (user_id, created_at DESC);