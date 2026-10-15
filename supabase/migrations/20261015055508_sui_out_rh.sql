alter table public.sui_out_hops drop constraint if exists sui_out_hops_target_check;
alter table public.sui_out_hops add constraint sui_out_hops_target_check check (target = any (array['BNB','ETH_BASE','ETH_ARB','ETH_RH']));
