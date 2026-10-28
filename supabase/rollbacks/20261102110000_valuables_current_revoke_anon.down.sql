-- Rollback zu 20261102110000_valuables_current_revoke_anon.sql: stellt das Leserecht fuer anon wieder her.
grant select on public.valuables_current to anon;
