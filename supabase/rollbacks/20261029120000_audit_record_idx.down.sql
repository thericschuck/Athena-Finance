-- Rollback zu 20261029120000_audit_record_idx.sql
drop index if exists public.audit_log_table_record_idx;
