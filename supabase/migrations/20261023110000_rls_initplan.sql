/**
 * RLS-Policies: `auth.uid()` (bzw. `auth.jwt()` / `auth.role()`) wird als `(select auth.uid())` geschrieben.
 *
 * Warum: Steht `auth.uid()` blank in einer Policy, wertet Postgres den Ausdruck für JEDE Zeile neu aus (im Plan als Filter-Ausdruck
 * statt als InitPlan sichtbar). `(select auth.uid())` wird einmal je Abfrage berechnet. Der Supabase-Advisor meldete das als
 * `auth_rls_initplan` für 119 Policies auf 73 Tabellen. Siehe https://supabase.com/docs/guides/database/postgres/row-level-security
 *
 * Wie: Alle Policies im Schema public werden gelesen, jedes nicht schon eingewickelte `auth.<fn>()` wird ersetzt, `ALTER POLICY` setzt
 * USING bzw. WITH CHECK neu. Name, Rolle (TO ...) und Befehl (FOR ...) bleiben unverändert, die Semantik ebenso.
 * Vorher werden ALLE Original-Definitionen in `public._rls_policy_backup_20261023` gesichert; der Rollback stellt sie von dort
 * exakt wieder her (supabase/rollbacks/20261023110000_rls_initplan.down.sql).
 *
 * Zusätzlich: `account_balances` hatte eine EXISTS-Subquery über `accounts`; sie wird zu `account_id in (select id from accounts where
 * user_id = (select auth.uid()))` umgeschrieben (gleiche Bedeutung, Hash-Semi-Join statt Korrelation je Zeile).
 */

create table if not exists public._rls_policy_backup_20261023 (
  schemaname text not null,
  tablename  text not null,
  policyname text not null,
  qual       text,
  with_check text,
  primary key (schemaname, tablename, policyname)
);
-- Nur Backup, nie über die API lesbar: RLS an, keine Policy, keine Rechte für anon/authenticated.
alter table public._rls_policy_backup_20261023 enable row level security;
revoke all on public._rls_policy_backup_20261023 from anon, authenticated;
create policy backup_kein_zugriff on public._rls_policy_backup_20261023 for all using (false) with check (false);

insert into public._rls_policy_backup_20261023 (schemaname, tablename, policyname, qual, with_check)
select schemaname, tablename, policyname, qual, with_check
from pg_policies
where schemaname = 'public'
on conflict do nothing;

do $$
declare
  p record;
  neu_qual text;
  neu_check text;
  teile text;
  geaendert int := 0;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from public._rls_policy_backup_20261023
  loop
    -- Nur Vorkommen ohne "SELECT " davor: bereits eingewickelte (deparst als "( SELECT auth.uid() AS uid)") bleiben unberührt.
    neu_qual  := regexp_replace(p.qual,       '(?<!SELECT )auth\.(uid|jwt|role)\(\)', '(select auth.\1())', 'g');
    neu_check := regexp_replace(p.with_check, '(?<!SELECT )auth\.(uid|jwt|role)\(\)', '(select auth.\1())', 'g');

    if neu_qual is distinct from p.qual or neu_check is distinct from p.with_check then
      teile := '';
      if neu_qual is not null then teile := teile || ' using (' || neu_qual || ')'; end if;
      if neu_check is not null then teile := teile || ' with check (' || neu_check || ')'; end if;
      execute format('alter policy %I on %I.%I%s', p.policyname, p.schemaname, p.tablename, teile);
      geaendert := geaendert + 1;
    end if;
  end loop;
  raise notice 'RLS-Policies umgestellt: %', geaendert;
end
$$;

-- account_balances: EXISTS-Korrelation -> Semi-Join über die eigenen Konten.
alter policy own_account_balances on public.account_balances
  using (account_id in (select id from public.accounts where user_id = (select auth.uid())));
