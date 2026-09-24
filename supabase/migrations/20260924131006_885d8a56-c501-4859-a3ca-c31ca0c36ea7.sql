-- lovable-cron-fallback-reviewed: X provides no push/webhook for mentions on this API tier; the bot now checks every 15 seconds so replies feel instant.
create or replace function public.run_x_poll_burst()
returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
begin
  perform public.run_x_poll();
  perform pg_sleep(15);
  perform public.run_x_poll();
  perform pg_sleep(15);
  perform public.run_x_poll();
  perform pg_sleep(15);
  perform public.run_x_poll();
end;
$$;

revoke all on function public.run_x_poll_burst() from public, anon, authenticated;
grant execute on function public.run_x_poll_burst() to service_role;

select cron.unschedule('x-mention-poll') where exists (select 1 from cron.job where jobname = 'x-mention-poll');
select cron.schedule('x-mention-poll', '* * * * *', $$select public.run_x_poll_burst();$$);