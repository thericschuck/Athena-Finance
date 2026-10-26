-- Kontosummen zaehlen Umbuchungen mit.
--
-- Die Views account_balance_sums_manual/_unified haben nur income (+) und expense (-) gezaehlt, alles
-- andere mit 0 -- auch `transfer`. Eine Umbuchung zwischen eigenen Konten bewegt aber Geld: beim
-- Geteilten Konto (Malik) fehlten dadurch 20 Umbuchungen mit zusammen -2.750 EUR, die Buchungssumme
-- (2.894,71) wich vom Bank-Saldo (144,71) ab. Mit Umbuchungen stimmt sie auf den Cent.
--
-- Regel wie in fn_recompute_account_balances (dem Verlauf der Salden):
--  - Bank-Umbuchungen kommen als zwei eigene Buchungen (eine je Konto, signed_amount traegt das
--    Vorzeichen) und haengen schon je an ihrem Konto.
--  - Eine MANUELLE Umbuchung ist EINE Zeile (Abgang auf account_id, Zugang auf transfer_to): die
--    Gegenbuchung kommt als zweiter Zweig dazu.
-- Spalten, Namen und Typen bleiben gleich (die Rechte bleiben erhalten; security_invoker MUSS neu gesetzt werden, s. u.).

create or replace view public.account_balance_sums_manual as
select m.user_id,
       m.account_id,
       sum(m.delta) as balance,
       (count(*) filter (where m.eigen))::integer as tx_count
from (
  select t.user_id, t.account_id, true as eigen,
         case t.type
           when 'income'   then t.amount
           when 'expense'  then -t.amount
           when 'transfer' then -t.amount
           else 0::numeric
         end as delta
  from public.transactions t
  where t.account_id is not null
  union all
  select t.user_id, t.transfer_to, false, t.amount
  from public.transactions t
  where t.type = 'transfer' and t.transfer_to is not null
) m
group by m.user_id, m.account_id;

create or replace view public.account_balance_sums_unified as
select m.user_id,
       m.account_id,
       sum(m.delta) as balance,
       (count(*) filter (where m.eigen))::integer as tx_count
from (
  select u.user_id, u.account_id, true as eigen,
         case u.type
           when 'income'   then u.amount
           when 'expense'  then -u.amount
           when 'transfer' then u.signed_amount
           else 0::numeric
         end as delta
  from public.unified_transactions u
  where u.account_id is not null
  union all
  select u.user_id, u.transfer_to, false, u.amount
  from public.unified_transactions u
  where u.source = 'manual' and u.type = 'transfer' and u.transfer_to is not null
) m
group by m.user_id, m.account_id;

-- ACHTUNG: CREATE OR REPLACE VIEW setzt die View-Optionen zurueck -- ohne diese zwei Zeilen liefen die Views
-- mit Eigentuemerrechten und an RLS vorbei. Immer nach einem Replace erneut setzen.
alter view public.account_balance_sums_manual set (security_invoker = on);
alter view public.account_balance_sums_unified set (security_invoker = on);
