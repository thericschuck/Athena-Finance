-- HAERTUNG: Tabellenrechte und Schreib-Policies auf exchange_keys und den Kurs-Tabellen.
-- Warum: Supabase vergibt auf public-Tabellen standardmaessig alle Rechte an anon und authenticated (auch TRUNCATE, das RLS umgeht).
-- Fuer diese Tabellen braucht die App das nicht. Zusaetzlich durfte jeder eingeloggte Nutzer fund_price_cache und fund_prices
-- beschreiben und loeschen (Integritaetsrisiko, sobald mehrere Nutzer existieren).
-- Was:
--   exchange_keys: anon verliert alles; authenticated behaelt SELECT/INSERT/UPDATE/DELETE (die App nutzt den Nutzer-Client),
--     verliert TRUNCATE/REFERENCES/TRIGGER.
--   fund_price_cache: Schreib-Policy fund_price_cache_write_auth entfernt, Schreibrechte entzogen (geschrieben wird per Edge-Function
--     fetch-fund-price mit service_role).
--   fund_prices: Loesch-Policy entfernt; INSERT/UPDATE fuer authenticated bleiben (src/app/actions/depot.ts upsertFundPrice schreibt per
--     Nutzer-Client). Offener Punkt: Schreibweg auf service_role/definer-RPC umstellen, dann auch diese Policies entfernen.
--   fund_price_history: Schreibrechte entzogen (Schreiben nur fn_take_snapshot (definer) und service_role).
-- Auf der Live-DB am 2026-10-27 per apply_migration angewendet (Name: harden_table_grants).
-- Rueckgaengig: supabase/rollbacks/20261031090000_harden_table_grants.down.sql

revoke all on table public.exchange_keys from anon;
revoke truncate, references, trigger on table public.exchange_keys from authenticated;

drop policy if exists fund_price_cache_write_auth on public.fund_price_cache;
revoke insert, update, delete, truncate, references, trigger on table public.fund_price_cache from anon, authenticated;

drop policy if exists fund_prices_delete_auth on public.fund_prices;
revoke insert, update, delete, truncate, references, trigger on table public.fund_prices from anon;
revoke delete, truncate, references, trigger on table public.fund_prices from authenticated;

revoke insert, update, delete, truncate, references, trigger on table public.fund_price_history from anon, authenticated;
