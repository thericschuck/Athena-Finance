-- Invarianten Haushalt Phase 1. Jede Zeile ist eine Pruefung; `ok` muss ueberall true sein. Lesend, aendert nichts.
-- Ausfuehren nach den Migrationen 20261027100000-120000: Supabase SQL-Editor, `supabase db query` oder die MCP.

select 'A: Haushalt Schuck existiert genau einmal' as pruefung,
       count(*) = 1 as ok, count(*) as wert
from public.households where name = 'Haushalt Schuck'
union all
select 'B: Haushalt hat genau einen owner, und er besitzt die Konten',
       count(*) = 1 and bool_and(exists (select 1 from public.accounts a where a.user_id = m.user_id)), count(*)
from public.household_members m
join public.households h on h.id = m.household_id
where h.name = 'Haushalt Schuck' and m.role = 'owner'
union all
select 'C: jeder Nutzer hoechstens in einem Haushalt',
       count(*) = 0, count(*)
from (select user_id from public.household_members group by user_id having count(*) > 1) x
union all
select 'D: genau 1 geteiltes Konto',
       count(*) = 1, count(*)
from public.accounts where shared
union all
select 'E: shared-Spalte (boolean, not null, default false) auf allen 12 Tabellen',
       count(*) = 12, count(*)
from information_schema.columns
where table_schema = 'public' and column_name = 'shared'
  and data_type = 'boolean' and is_nullable = 'NO' and column_default = 'false'
  and table_name in ('accounts','valuables','depots','depot_holdings','depot_transactions','savings_plans',
                     'contracts','debts','savings_goals','budget_categories','budget_items','assets')
union all
select 'F: belege und income_targets haben KEIN shared (bleiben privat)',
       count(*) = 0, count(*)
from information_schema.columns
where table_schema = 'public' and column_name = 'shared' and table_name in ('belege', 'income_targets')
union all
select 'G: beide Funktionen existieren, security definer, search_path gepinnt, stable',
       count(*) = 2
         and bool_and(p.prosecdef) and bool_and(p.provolatile = 's')
         and bool_and(coalesce(p.proconfig::text[] && array['search_path=""', 'search_path='''''], false)), count(*)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('is_household_member', 'household_peer_ids')
union all
select 'H: EXECUTE der Funktionen nur fuer authenticated/service_role (nicht anon/PUBLIC)',
       count(*) = 0, count(*)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('is_household_member', 'household_peer_ids')
  and (has_function_privilege('anon', p.oid, 'execute')
       or not has_function_privilege('authenticated', p.oid, 'execute')
       or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0))
union all
select 'I: RLS an auf households und household_members',
       count(*) = 2, count(*)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('households', 'household_members') and c.relrowsecurity
union all
select 'J: keine Schreib-Policies fuer authenticated auf den Haushaltstabellen',
       count(*) = 0, count(*)
from pg_policies
where schemaname = 'public' and tablename in ('households', 'household_members') and cmd <> 'SELECT'
union all
select 'K: Haushaltspolicies in Initplan-Schreibweise',
       count(*) = 2 and bool_and(qual like '%SELECT is_household_member%' or qual like '%( SELECT public.is_household_member%'
                                 or qual ~* 'select\s+(public\.)?is_household_member'), count(*)
from pg_policies
where schemaname = 'public' and tablename in ('households', 'household_members') and cmd = 'SELECT'
order by 1;
