-- Adds `signed_amount` to unified_transactions.
--
-- Why: for a transfer between two of the user's OWN accounts, `transactions` stores ONE row
-- (the outgoing side, with transfer_to pointing at the receiver), while FinTS delivers TWO
-- independent bank_transactions — a debit on the sender and a credit on the receiver, each
-- with the other account as counterpart_iban. The view maps both of them to type 'transfer'
-- with abs(amount) and a non-null transfer_to, so any consumer applying the manual
-- one-row-per-transfer rule ("debit this account, credit transfer_to") processes the same
-- movement twice in opposite directions and it cancels out to nothing. On "Geteiltes Konto
-- (Malik)", where 16 of 36 postings are internal transfers, that wiped out most of the
-- account's balance history.
--
-- Keeping type = 'transfer' matters: the analytics pages rely on it to keep internal
-- transfers out of income/expense totals. So rather than re-typing the rows, the view now
-- also exposes the plain signed effect of each row on its own account. Balance math uses
-- signed_amount (and, for bank rows, ignores transfer_to since both legs are present);
-- everything reading `type`/`amount` is unaffected.
--
-- NOTE: `create or replace view` may only APPEND columns — the existing list and its order
-- (… source, category_type) is reproduced verbatim and signed_amount goes last.

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
  c.type as category_type,
  -- Manual rows: a transfer is the outgoing side only; the credit is applied to transfer_to
  -- by the consumer, exactly as before.
  case
    when t.type = 'income'   then  coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1))
    when t.type = 'expense'  then -coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1))
    when t.type = 'transfer' then -coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1))
    else 0::numeric
  end as signed_amount
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
  c.type as category_type,
  -- Bank rows already carry the sign, and BOTH legs of an internal transfer exist as their
  -- own row — so each row's effect on its own account is simply its own amount.
  bt.amount as signed_amount
from bank_transactions bt
join accounts a
  on a.user_id = bt.user_id and a.bank_iban = bt.account_iban
left join categories c on c.id = bt.category_id
left join accounts own
  on own.user_id = bt.user_id and own.bank_iban = bt.counterpart_iban;

grant select on unified_transactions to authenticated, anon;
