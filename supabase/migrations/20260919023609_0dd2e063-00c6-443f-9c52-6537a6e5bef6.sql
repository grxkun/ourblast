-- lovable-cron-fallback-reviewed: 1440 runs/day; X provides no push/webhook for mentions on this API tier, so replies to launch tweets require minute-level polling to feel instant.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.set_x_poll_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if exists (select 1 from vault.secrets where name = 'x_bot_webhook_secret') then
    perform vault.update_secret((select id from vault.secrets where name = 'x_bot_webhook_secret'), p_secret, 'x_bot_webhook_secret');
  else
    perform vault.create_secret(p_secret, 'x_bot_webhook_secret', 'Bearer token for the @ourblastbot mention poller');
  end if;
end;
$$;

create or replace function public.run_x_poll()
returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'x_bot_webhook_secret';
  if v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := 'https://project--958fa5ba-df9a-4c41-832b-79e8d4dd0201.lovable.app/api/public/x-poll',
    headers := jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end;
$$;

revoke all on function public.set_x_poll_secret(text) from public, anon, authenticated;
revoke all on function public.run_x_poll() from public, anon, authenticated;
grant execute on function public.set_x_poll_secret(text) to service_role;
grant execute on function public.run_x_poll() to service_role;

select cron.schedule('x-mention-poll', '* * * * *', $$select public.run_x_poll();$$);