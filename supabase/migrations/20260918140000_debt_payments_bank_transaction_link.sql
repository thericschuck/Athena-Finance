-- debt_payments hat bereits transaction_id (FK auf die manuelle `transactions`-Tabelle),
-- aber Schulden-relevante Buchungen kommen oft aus dem FinTS-Sync (`bank_transactions`) --
-- eine zweite Tabelle, auf die dieselbe Spalte nicht zeigen kann. Ohne dieses Gegenstück
-- kann eine aus einer Bankbuchung gebuchte Zahlung nicht als "bereits verbucht" erkannt
-- werden, und derselbe Vorschlag würde bei jedem Aufruf erneut auftauchen.
alter table public.debt_payments
  add column if not exists bank_transaction_id uuid references public.bank_transactions(id);

-- Schützt vor Doppelklicks auf denselben Vorschlag: dieselbe Quellbuchung darf nicht
-- zweimal als Zahlung verbucht werden.
create unique index if not exists debt_payments_transaction_id_unique
  on public.debt_payments (transaction_id) where transaction_id is not null;

create unique index if not exists debt_payments_bank_transaction_id_unique
  on public.debt_payments (bank_transaction_id) where bank_transaction_id is not null;
