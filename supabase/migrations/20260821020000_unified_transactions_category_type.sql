-- Adds category_type to unified_transactions (categories.type — 'income'/'expense' as declared
-- on the category itself), needed by the daily-snapshot cron's classifyTx() bucketing, which
-- prefers the category's own declared type over the transaction's type. Postgres allows adding
-- trailing columns via CREATE OR REPLACE VIEW without dropping the view.
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
  'manual'::text as source,
  c.type as category_type
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
  'bank_sync'::text as source,
  c.type as category_type
from bank_transactions bt
join accounts a
  on a.user_id = bt.user_id and a.bank_iban = bt.account_iban
left join categories c on c.id = bt.category_id
left join accounts own
  on own.user_id = bt.user_id and own.bank_iban = bt.counterpart_iban;

grant select on unified_transactions to authenticated, anon;
