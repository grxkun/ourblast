create table public.sui_out_hops (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  x_username text not null,
  target text not null check (target in ('BNB','ETH_BASE','ETH_ARB')),
  amount_sui numeric not null,
  sol_address text not null,
  evm_recipient text not null,
  sol_baseline bigint not null,
  sol_expected bigint not null,
  sui_digest text,
  status text not null default 'sent' check (status in ('sent','hopping','done','failed')),
  leg2_tx text,
  out_formatted text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sui_out_hops_status_idx on public.sui_out_hops (status);
create unique index sui_out_hops_one_open on public.sui_out_hops (sol_address) where status in ('sent','hopping');
alter table public.sui_out_hops enable row level security;
create policy "own hops readable" on public.sui_out_hops for select to authenticated using (user_id = auth.uid());
grant select on public.sui_out_hops to authenticated;
grant all on public.sui_out_hops to service_role;