-- Links manual `accounts` rows to the FinTS-synced accounts in bank_balance/bank_transactions,
-- so accounts that already exist manually (Girokonto, Geschäftsanteile) stop being tracked
-- twice, and any bank account discovered by sync with no manual counterpart yet gets one
-- automatically. Implemented as a trigger on bank_balance (not app code) because sync writes
-- to bank_balance from three different places — the local TS route, the Node cron, and the
-- Python cloud path that's what actually runs for the live user — a DB trigger is the one
-- place all three funnel through.

alter table accounts add column if not exists bank_iban text;

create unique index if not exists accounts_user_bank_iban_idx
  on accounts (user_id, bank_iban)
  where bank_iban is not null;

create or replace function fn_ensure_linked_account(
  p_user_id        uuid,
  p_iban            text,
  p_account_name    text,
  p_booked_balance  numeric,
  p_currency        text
) returns uuid as $$
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
$$ language plpgsql;

create or replace function fn_link_bank_account() returns trigger as $$
begin
  perform fn_ensure_linked_account(
    new.user_id, new.account_iban, new.account_name, new.booked_balance, new.currency
  );
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_link_bank_account on bank_balance;
create trigger trg_link_bank_account
  after insert or update on bank_balance
  for each row execute function fn_link_bank_account();

-- One-time backfill for bank_balance rows that already existed before this migration.
do $$
declare r record;
begin
  for r in select * from bank_balance loop
    perform fn_ensure_linked_account(r.user_id, r.account_iban, r.account_name, r.booked_balance, r.currency);
  end loop;
end $$;

-- ── Unified transactions view ────────────────────────────────────────────────────────────────
-- Combines the manual `transactions` ledger with `bank_transactions` for any account linked via
-- accounts.bank_iban, so Finance reads one source instead of maintaining a second query path per
-- consumer. security_invoker means the view re-checks the querying user's own RLS on the
-- underlying tables — it grants no more access than querying transactions/bank_transactions
-- directly would.
create or replace view unified_transactions with (security_invoker = on) as
select
  t.id,
  t.user_id,
  t.account_id,
  a.name  as account_name,
  a.color as account_color,
  t.category_id,
  c.name  as category_name,
  c.color as category_color,
  t.date,
  t.type,
  t.amount,
  t.amount_base,
  t.fx_rate,
  t.currency,
  t.description,
  t.merchant,
  t.transfer_to,
  t.contract_id,
  t.tags,
  'manual'::text as source
from transactions t
left join accounts   a on a.id = t.account_id
left join categories c on c.id = t.category_id

union all

select
  bt.id,
  bt.user_id,
  a.id    as account_id,
  a.name  as account_name,
  a.color as account_color,
  bt.category_id,
  c.name  as category_name,
  c.color as category_color,
  bt.value_date as date,
  case
    when own.id is not null then 'transfer'
    when bt.amount >= 0     then 'income'
    else 'expense'
  end as type,
  abs(bt.amount) as amount,
  abs(bt.amount) as amount_base,
  1::numeric as fx_rate,
  bt.currency,
  coalesce(bt.description, bt.raw_description) as description,
  bt.counterpart_name as merchant,
  own.id as transfer_to,
  null::uuid as contract_id,
  '{}'::text[] as tags,
  'bank_sync'::text as source
from bank_transactions bt
join accounts a
  on a.user_id = bt.user_id and a.bank_iban = bt.account_iban
left join categories c on c.id = bt.category_id
left join accounts own
  on own.user_id = bt.user_id and own.bank_iban = bt.counterpart_iban;

grant select on unified_transactions to authenticated, anon;
