-- Rollback zu 20261113130000_rechte_einschraenken_s4_s7_e1_e2.sql: stellt die Rechte und Policies vom 2026-11-13 wieder her.
-- Das macht die Sicherheitsluecken S4, S7, E1, E2 wieder auf. Nur als Notbremse gedacht (z. B. wenn die Migration vor dem
-- App-Code lief und Kraken-Sync/Rebalancing ausfallen). Besser: den App-Code ausliefern und die Migration erneut anwenden.

-- S4: fund_prices
revoke all on public.fund_prices from authenticated;
grant select, insert, update on public.fund_prices to authenticated;
drop policy if exists fund_prices_insert_auth on public.fund_prices;
create policy fund_prices_insert_auth on public.fund_prices
  for insert to public with check ((select auth.uid()) is not null);
drop policy if exists fund_prices_update_auth on public.fund_prices;
create policy fund_prices_update_auth on public.fund_prices
  for update to public using ((select auth.uid()) is not null);

-- S7: bank_connections (SELECT bleibt je Spalte wie vorher, pin_enc/username_enc ungrantet)
grant insert, update, delete on public.bank_connections to authenticated;

-- E1: exchange_keys (vorher: Tabellenrechte SELECT, INSERT, UPDATE, DELETE fuer authenticated)
revoke select (id, user_id, exchange, created_at) on public.exchange_keys from authenticated;
grant select, insert, update, delete on public.exchange_keys to authenticated;

-- E2: fints_client_state (vorher: alle Rechte fuer anon und authenticated, Policy fuer authenticated)
grant all on public.fints_client_state to anon, authenticated;
drop policy if exists fints_client_state_own on public.fints_client_state;
create policy fints_client_state_own on public.fints_client_state
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
