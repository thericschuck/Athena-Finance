-- HAUSHALT PHASE 5: Index fuer "Zuletzt geaendert" (Abfrage je Tabelle + record_id, neueste zuerst) und die
-- Verlaufsliste (Sortierung created_at desc, id desc). Nur DDL, idempotent. NICHT angewendet (Datei liegt bereit).
-- Rueckgaengig: drop index if exists public.audit_log_table_record_idx;
create index if not exists audit_log_table_record_idx
  on public.audit_log (table_name, record_id, created_at desc);
