-- Rollback: stellt den Fremdschluessel wieder her (schlaegt fehl, falls verwaiste user_id-Werte existieren).
alter table public.audit_log add constraint audit_log_user_id_fkey foreign key (user_id) references auth.users(id);
