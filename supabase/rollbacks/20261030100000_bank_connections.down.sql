-- Rollback zu 20261030100000_bank_connections.sql.
-- ACHTUNG: loescht alle gespeicherten Bankverbindungen (verschluesselte Zugangsdaten). Danach greift fuer den Env-Nutzer
-- (BANK_SYNC_USER_ID) wieder allein der Env-Fallback; fints_client_state bleibt unberuehrt.
drop policy if exists bank_connections_own on public.bank_connections;
drop table if exists public.bank_connections;
