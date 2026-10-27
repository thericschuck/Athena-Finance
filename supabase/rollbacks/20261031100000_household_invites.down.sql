-- Rollback zu 20261031100000_household_invites.sql. ACHTUNG: loescht household_invites samt offenen Einladungen.
-- Bereits erfolgte Beitritte (household_members) und zusammengefuehrte Kategorien werden NICHT rueckgaengig gemacht.
-- Stellt fn_audit und fn_ensure_linked_account exakt auf die Live-Definitionen vom 2026-10-27 zurueck.

drop trigger if exists trg_accounts_iban_peer on public.accounts;
drop trigger if exists trg_bank_balance_peer_skip on public.bank_balance;
drop trigger if exists trg_bank_transactions_peer_skip on public.bank_transactions;
drop function if exists public.trg_accounts_iban_peer();
drop function if exists public.trg_bank_balance_peer_skip();
drop function if exists public.trg_bank_transactions_peer_skip();

drop function if exists public.fn_accept_household_invite(text, uuid, text);
drop function if exists public.fn_merge_user_categories_into_household(uuid, uuid);
drop function if exists public.fn_remove_household_member(uuid, uuid, uuid);

drop table if exists public.household_invites;

create or replace function public.fn_audit()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_id    uuid;
  v_old   jsonb;
  v_new   jsonb;
begin
  if TG_OP <> 'INSERT' then v_old := to_jsonb(old); end if;
  if TG_OP <> 'DELETE' then v_new := to_jsonb(new); end if;

  if TG_OP = 'UPDATE' and (v_old = v_new or (v_old - 'updated_at') = (v_new - 'updated_at')) then
    return new;
  end if;

  v_owner := (coalesce(v_new, v_old) ->> 'user_id')::uuid;
  if coalesce(v_actor, v_owner) is null then
    return case when TG_OP = 'DELETE' then old else new end;
  end if;

  v_id := (coalesce(v_new, v_old) ->> 'id')::uuid;

  insert into public.audit_log
    (user_id, actor_id, actor_kind, owner_id, table_name, record_id, action, old_values, new_values)
  values (
    coalesce(v_actor, v_owner),
    v_actor,
    case when v_actor is not null then 'user' else 'system' end,
    v_owner,
    TG_TABLE_NAME, v_id, TG_OP, v_old, v_new
  );

  return case when TG_OP = 'DELETE' then old else new end;
end;
$function$;

create or replace function public.fn_ensure_linked_account(p_user_id uuid, p_iban text, p_account_name text, p_booked_balance numeric, p_currency text)
 returns uuid
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_account_id uuid;
  v_norm_iban  text := upper(replace(p_iban, ' ', ''));
begin
  select id into v_account_id from accounts
    where user_id = p_user_id and bank_iban = p_iban;

  if v_account_id is null then
    -- Match an existing manual account whose free-text iban (Girokonto's full IBAN, or
    -- Geschäftsanteile's bare Genossenschaftsanteil-Nummer) is a substring of the synced IBAN.
    select id into v_account_id from accounts
      where user_id = p_user_id
        and bank_iban is null
        and iban is not null
        and length(regexp_replace(iban, '\s', '', 'g')) > 0
        and v_norm_iban ilike '%' || upper(regexp_replace(iban, '\s', '', 'g')) || '%'
      order by created_at
      limit 1;

    if v_account_id is not null then
      update accounts set bank_iban = p_iban, updated_at = now() where id = v_account_id;
    else
      insert into accounts (user_id, name, type, iban, bank_iban, institution, currency, is_active)
      values (
        p_user_id,
        coalesce(p_account_name, 'Konto …' || right(p_iban, 4)),
        'checking',
        p_iban,
        p_iban,
        'Raiffeisenbank',
        coalesce(p_currency, 'EUR'),
        true
      )
      returning id into v_account_id;
    end if;
  end if;

  -- Keep account_balances current so fn_take_snapshot's net-worth totals pick up synced
  -- accounts automatically, without any change to that function.
  -- account_balances.source is constrained to ('cron','manual','backfill') — this counts as
  -- an automated/cron-style write, not a hand-entered one.
  insert into account_balances (account_id, snapshot_date, balance, currency, source)
  values (v_account_id, current_date, p_booked_balance, coalesce(p_currency, 'EUR'), 'cron')
  on conflict (account_id, snapshot_date) do update
    set balance = excluded.balance, source = excluded.source;

  return v_account_id;
end;
$function$;

drop function if exists public.fn_iban_peer_owned(uuid, text);
drop function if exists public.fn_household_peer_users(uuid);
drop function if exists public.fn_norm_iban(text);
drop function if exists public.is_household_owner(uuid);

-- Urspruengliche ACL von fn_ensure_linked_account (PUBLIC, anon, authenticated, service_role).
grant execute on function public.fn_ensure_linked_account(uuid, text, text, numeric, text) to public, anon, authenticated, service_role;
