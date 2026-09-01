-- Ergänzt `booked_date` in unified_transactions.
--
-- Ob eine Buchung im gemeldeten `bank_balance.booked_balance` steckt, entscheidet der
-- BUCHUNGSTAG (entry_date), nicht die Valuta (value_date). Die Valuta betrifft nur die
-- Zinsrechnung. Die Bank liefert Vorausbuchungen bereits mit — beobachtet auf dem
-- Girokonto: eine Belastung mit Valuta 28.08. und Buchungstag 31.08., sowie eine Gutschrift
-- mit beiden Daten auf dem 31.08.
--
-- Wer solche Zeilen über die Valuta einsortiert, zählt sie zu früh mit. Genau das trennte
-- die beiden Saldenkurven: die Kontodetailseite (rechnet aus account_balances über
-- value_date) und der Banking-Verlauf (rekonstruiert über den Buchungstag) wichen dadurch
-- dauerhaft um 592,50 EUR voneinander ab, obwohl sie dasselbe Konto zeigen.
--
-- `booked_date` gibt beiden Seiten dasselbe Feld, an dem sie sich ausrichten können. Für
-- manuelle Buchungen ist es schlicht `date` — dort gibt es keine zwei Daten.
--
-- NOTE: `create or replace view` darf nur ANHÄNGEN — die bestehende Spaltenliste und ihre
-- Reihenfolge bleiben unverändert, booked_date kommt ans Ende.


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
  end as signed_amount,
  t.date as booked_date
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
  bt.amount as signed_amount,
  -- Buchungstag, nicht Valuta — siehe Kopfkommentar.
  coalesce(bt.entry_date, bt.value_date) as booked_date
from bank_transactions bt
join accounts a
  on a.user_id = bt.user_id and a.bank_iban = bt.account_iban
left join categories c on c.id = bt.category_id
left join accounts own
  on own.user_id = bt.user_id and own.bank_iban = bt.counterpart_iban;

grant select on unified_transactions to authenticated, anon;
