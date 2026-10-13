-- Pending X "bridge SOL" requests awaiting a "confirm bridge" reply from the same user.
create table public.sol_bridge_intents (
  id uuid primary key default gen_random_uuid(),
  x_username text not null,
  x_post_id text not null unique,
  amount_sol numeric,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sol_bridge_intents_user_idx on public.sol_bridge_intents (x_username, expires_at);
alter table public.sol_bridge_intents enable row level security;
grant all on public.sol_bridge_intents to service_role;
