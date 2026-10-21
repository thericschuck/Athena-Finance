-- Rollback zu 20261021110000: unified_transactions auf den Stand von 20260902100000 zurück,
-- aber mit security_invoker (Stand von 20261020130000) und ohne Zugriff für anon.
-- CREATE OR REPLACE kann keine Spalten entfernen, deshalb drop + create.
-- Reihenfolge: erst 20261021120000.down (monthly_flows), dann dieses Skript.
-- Alles in einer Transaktion: scheitert ein Schritt, bleibt der alte Zustand.
begin;

drop view if exists public.monthly_flows;
drop view if exists public.account_balance_sums_unified;
drop view if exists public.unified_transactions;

create view public.unified_transactions
with (security_invoker = on) as
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
    'manual'::text as source,
    c.type as category_type,
    case
      when t.type = 'income'   then coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1::numeric))
      when t.type = 'expense'  then -coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1::numeric))
      when t.type = 'transfer' then -coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1::numeric))
      else 0::numeric
    end as signed_amount,
    t.date as booked_date,
    t.description as description_raw,
    case
      when t.type = 'transfer'                                             then 'umbuchung'
      when t.description ilike 'alter kontostand%'                         then 'anfangsbestand'
      when c.type = 'neutral' and coalesce(pc.name, c.name) = 'Schulden'   then 'forderung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) <> 'Transfers' then 'anlage'
      else 'echt'
    end as flow_kind
  from transactions t
    left join accounts a   on a.id = t.account_id
    left join categories c on c.id = t.category_id
    left join categories pc on pc.id = c.parent_id

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
      when own.id is not null      then 'transfer'::text
      when bt.amount >= 0::numeric then 'income'::text
      else 'expense'::text
    end as type,
    abs(bt.amount) as amount,
    abs(bt.amount) as amount_base,
    1::numeric     as fx_rate,
    bt.currency,
    fn_clean_bank_description(
      coalesce(bt.description, bt.raw_description), bt.counterpart_name
    ) as description,
    bt.counterpart_name as merchant,
    own.id              as transfer_to,
    null::uuid          as contract_id,
    '{}'::text[]        as tags,
    'bank_sync'::text   as source,
    c.type              as category_type,
    bt.amount           as signed_amount,
    coalesce(bt.entry_date, bt.value_date) as booked_date,
    coalesce(bt.description, bt.raw_description) as description_raw,
    case
      when own.id is not null                                              then 'umbuchung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) = 'Schulden'   then 'forderung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) <> 'Transfers' then 'anlage'
      else 'echt'
    end as flow_kind
  from bank_transactions bt
    join accounts a on a.user_id = bt.user_id and a.bank_iban = bt.account_iban
    left join categories c  on c.id = bt.category_id
    left join categories pc on pc.id = c.parent_id
    left join accounts own  on own.user_id = bt.user_id and own.bank_iban = bt.counterpart_iban;

-- Supabase vergibt auf neue Objekte Default-Grants (ALL an anon und authenticated).
revoke all on public.unified_transactions from anon, authenticated;
grant select on public.unified_transactions to authenticated;

create view public.account_balance_sums_unified
with (security_invoker = on) as
  select
    user_id,
    account_id,
    sum(case type
          when 'income'  then  amount
          when 'expense' then -amount
          else 0::numeric
        end)            as balance,
    count(*)::integer   as tx_count
  from public.unified_transactions
  where account_id is not null
  group by user_id, account_id;

revoke all on public.account_balance_sums_unified from anon, authenticated;
grant select on public.account_balance_sums_unified to authenticated;

commit;
