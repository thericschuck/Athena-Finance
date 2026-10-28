-- Rollback zu 20261028110000_audit_actor.sql. ACHTUNG: verwirft actor_id/actor_kind/owner_id und damit die
-- Urheber-Information. Vorher Code/Views entfernen, die v_audit_feed oder die neuen Spalten nutzen.
-- Stellt den Stand vor der Migration wieder her (Live-Definitionen vom 2026-10-26).

drop view if exists public.v_audit_feed;

drop policy if exists audit_log_select_household on public.audit_log;
drop policy if exists audit_log_select_own on public.audit_log;
create policy audit_log_select_own on public.audit_log
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.fn_audit()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user uuid;
  v_id   uuid;
begin
  if TG_OP = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then
    return new;
  end if;

  v_user := coalesce(
    auth.uid(),
    case when TG_OP = 'DELETE' then (to_jsonb(old) ->> 'user_id')::uuid
         else (to_jsonb(new) ->> 'user_id')::uuid end
  );
  if v_user is null then
    return case when TG_OP = 'DELETE' then old else new end;
  end if;

  v_id := case when TG_OP = 'DELETE' then (to_jsonb(old) ->> 'id')::uuid
               else (to_jsonb(new) ->> 'id')::uuid end;

  insert into public.audit_log (user_id, table_name, record_id, action, old_values, new_values)
  values (
    v_user, TG_TABLE_NAME, v_id, TG_OP,
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(new) end
  );

  return case when TG_OP = 'DELETE' then old else new end;
end;
$function$;

do $$
declare
  t text;
begin
  foreach t in array array['accounts','contracts','debts','savings_goals','valuables','assets','depots',
                           'depot_transactions','savings_plans','budget_categories','budget_items']
  loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('drop trigger if exists %I on public.%I', 'trg_audit_' || t, t);
    end if;
  end loop;
end $$;

drop index if exists public.audit_log_owner_created_idx;
alter table public.audit_log drop constraint if exists audit_log_actor_kind_check;
alter table public.audit_log drop column if exists actor_kind;
alter table public.audit_log drop column if exists actor_id;
alter table public.audit_log drop column if exists owner_id;

comment on column public.audit_log.user_id is null;
