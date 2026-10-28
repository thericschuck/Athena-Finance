-- Rollback zu 20261031090000_harden_table_grants.sql: stellt den Zustand vom 2026-10-26 wieder her
-- (Supabase-Standardrechte fuer anon/authenticated und die alten Schreib-Policies). Nur bei Bedarf ausfuehren.
grant all on table public.exchange_keys to anon, authenticated;
grant all on table public.fund_price_cache to anon, authenticated;
grant all on table public.fund_prices to anon, authenticated;
grant all on table public.fund_price_history to anon, authenticated;

drop policy if exists fund_price_cache_write_auth on public.fund_price_cache;
create policy fund_price_cache_write_auth on public.fund_price_cache
  for all to public using (((select auth.uid()) is not null));

drop policy if exists fund_prices_delete_auth on public.fund_prices;
create policy fund_prices_delete_auth on public.fund_prices
  for delete to public using (((select auth.uid()) is not null));
