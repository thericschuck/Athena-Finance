-- Rollback zu 20261023110000_rls_initplan.sql: stellt ALLE Policies exakt so wieder her, wie sie vor der Migration waren
-- (Original-Definitionen aus public._rls_policy_backup_20261023), und löscht danach die Backup-Tabelle.
-- Policies, die nach der Migration neu angelegt wurden, stehen nicht im Backup und bleiben unverändert.
do $$
declare
  p record;
  teile text;
  zurueck int := 0;
begin
  if to_regclass('public._rls_policy_backup_20261023') is null then
    raise exception 'Backup-Tabelle public._rls_policy_backup_20261023 fehlt: Rollback nicht möglich.';
  end if;

  for p in
    select b.schemaname, b.tablename, b.policyname, b.qual, b.with_check
    from public._rls_policy_backup_20261023 b
    join pg_policies c
      on c.schemaname = b.schemaname and c.tablename = b.tablename and c.policyname = b.policyname
  loop
    teile := '';
    if p.qual is not null then teile := teile || ' using (' || p.qual || ')'; end if;
    if p.with_check is not null then teile := teile || ' with check (' || p.with_check || ')'; end if;
    if teile <> '' then
      execute format('alter policy %I on %I.%I%s', p.policyname, p.schemaname, p.tablename, teile);
      zurueck := zurueck + 1;
    end if;
  end loop;
  raise notice 'RLS-Policies zurückgesetzt: %', zurueck;
end
$$;

drop table public._rls_policy_backup_20261023;
