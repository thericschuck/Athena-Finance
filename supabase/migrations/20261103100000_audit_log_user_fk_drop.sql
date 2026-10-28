-- Der Fremdschluessel audit_log.user_id -> auth.users (NO ACTION) blockierte das Loeschen von Nutzern im Supabase-Dashboard
-- ("Database error deleting user"): vorhandene Audit-Zeilen verwiesen auf den Nutzer, und beim Kaskadieren der Nutzerdaten
-- schreibt fn_audit neue Zeilen mit user_id = Eigentuemer. Ein Aenderungsprotokoll soll Nutzer ueberleben, daher ohne FK.
-- Live am 2026-10-28 per apply_migration angewendet. Rueckgaengig: supabase/rollbacks/20261103100000_audit_log_user_fk_drop.down.sql
alter table public.audit_log drop constraint if exists audit_log_user_id_fkey;
