-- HAERTUNG: valuables_current war fuer anon lesbar (Standardrechte, schon vor 20261102100000). Zeilen sah anon nie
-- (RLS der Tabelle valuables nur fuer authenticated), aber eine View braucht fuer Anonyme kein Leserecht, wie alle anderen
-- Views (unified_transactions u. a.). Live am 2026-10-28 per apply_migration angewendet (valuables_current_revoke_anon).
-- Rueckgaengig: supabase/rollbacks/20261102110000_valuables_current_revoke_anon.down.sql
revoke all on public.valuables_current from anon;
