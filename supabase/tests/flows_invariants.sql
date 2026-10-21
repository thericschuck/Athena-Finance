-- Invarianten des Datenpools (Einnahmen/Ausgaben). Jede Zeile ist eine Prüfung; `ok` muss überall
-- true sein. Lesend, ändert nichts. Ausführen: Supabase SQL-Editor, `supabase db query` oder die MCP.
--
-- Hintergrund: Dashboard, Analyse, Banking, Konto-Detail, Reports und Athena sollen dieselbe
-- Zahl liefern. Diese Prüfungen stellen sicher, dass die Quelle (unified_transactions ->
-- monthly_flows -> monthly_flow_totals) in sich stimmt und gegen eine UNABHÄNGIGE Rechnung aus den
-- Rohtabellen aufgeht. Läuft nach jeder Migration an den Views und nach größeren Importen.

with
-- A) Unabhängige Rechnung aus den Rohtabellen (nicht über die View): alle Bankbuchungen ohne
--    Gegenkonto in eigenen Konten (oder mit einer bewusst gesetzten Einnahme-/Ausgabe-Kategorie, die die
--    Umbuchungs-Erkennung überstimmt, Migration 20261022120000) + manuelle income/expense ohne Anfangsbestand.
roh as (
  select m, sum(inc) inc, sum(exp) exp from (
    select date_trunc('month', bt.value_date)::date m,
           case when bt.amount >= 0 then bt.amount else 0 end inc,
           case when bt.amount <  0 then -bt.amount else 0 end exp
    from bank_transactions bt
    join accounts a on a.user_id = bt.user_id and a.bank_iban = bt.account_iban
    left join accounts own on own.user_id = bt.user_id and own.bank_iban = bt.counterpart_iban
    left join categories bc on bc.id = bt.category_id
    where own.id is null or coalesce(bc.type, 'neutral') in ('income', 'expense')
    union all
    select date_trunc('month', t.date)::date,
           case when t.type = 'income'  then abs(coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1))) else 0 end,
           case when t.type = 'expense' then abs(coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1))) else 0 end
    from transactions t
    where t.type in ('income', 'expense') and t.description not ilike 'alter kontostand%'
  ) x group by m
),
pool as (
  select month m, sum(income) inc, sum(expense) exp from monthly_flows group by month
),
tot as (
  select month m, sum(income) inc, sum(expense) exp from monthly_flow_totals group by month
)
select 'A: monthly_flows = unabhängige Rohrechnung (je Monat, ±0,01 €)' as pruefung,
       coalesce(bool_and(abs(coalesce(p.inc,0) - coalesce(r.inc,0)) < 0.01
                     and abs(coalesce(p.exp,0) - coalesce(r.exp,0)) < 0.01), true) as ok,
       count(*) filter (where abs(coalesce(p.inc,0) - coalesce(r.inc,0)) >= 0.01
                           or abs(coalesce(p.exp,0) - coalesce(r.exp,0)) >= 0.01) as abweichungen
from roh r full join pool p on p.m = r.m
union all
select 'B: monthly_flow_totals = monthly_flows (je Monat)',
       coalesce(bool_and(abs(t.inc - p.inc) < 0.005 and abs(t.exp - p.exp) < 0.005), true),
       count(*) filter (where abs(t.inc - p.inc) >= 0.005 or abs(t.exp - p.exp) >= 0.005)
from tot t join pool p on p.m = t.m
union all
select 'C: keine Umbuchung/kein Anfangsbestand in monthly_flows',
       count(*) = 0, count(*)
from monthly_flows where flow_kind not in ('echt', 'anlage', 'forderung')
union all
select 'D: counts_in_flow passt zu flow_kind',
       count(*) = 0, count(*)
from unified_transactions
where counts_in_flow is distinct from (flow_kind in ('echt', 'anlage', 'forderung'))
union all
select 'E: category_tree hat genau eine Zeile je Kategorie',
       (select count(*) from category_tree) = (select count(*) from categories)
       and (select count(distinct id) from category_tree) = (select count(*) from categories),
       abs((select count(*) from category_tree) - (select count(*) from categories))
union all
select 'F: jede kategorisierte Buchung hat eine Hauptkategorie',
       count(*) = 0, count(*)
from unified_transactions where category_id is not null and root_category_id is null
union all
select 'G: amount_eur ist nie negativ oder leer',
       count(*) = 0, count(*)
from unified_transactions where amount_eur is null or amount_eur < 0
union all
select 'H: alle Auswertungs-Views laufen mit security_invoker',
       count(*) = 0, count(*)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('unified_transactions', 'monthly_flows', 'monthly_flow_totals', 'category_tree',
                    'account_balance_sums_unified', 'account_balance_sums_manual')
  and not coalesce(c.reloptions::text[] && array['security_invoker=on', 'security_invoker=true'], false)
union all
select 'I: anon hat keinen Zugriff auf die Auswertungs-Views',
       count(*) = 0, count(*)
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
  and table_name in ('unified_transactions', 'monthly_flows', 'monthly_flow_totals', 'category_tree')
union all
select 'J: vererbte Steuerrolle = eigene Rolle, sonst die der Oberkategorie',
       count(*) = 0, count(*)
from category_tree t
join categories c on c.id = t.id
left join category_tree p on p.id = t.parent_id
where t.tax_role_effective is distinct from coalesce(c.tax_role, p.tax_role_effective)
union all
select 'K: Hauptkategorie hat keine Oberkategorie und Pfad beginnt mit ihrem Namen',
       count(*) = 0, count(*)
from category_tree t
join category_tree r on r.id = t.root_id
where r.parent_id is not null or t.path not like r.name || '%'
union all
select 'L: kein Betrieb-/Lohn-Betrag in Kategorien ohne Rolle mit Typ income (Einnahmen ohne Steuerrolle)',
       count(*) = 0, count(*)
from category_tree t
where t.type = 'income' and t.tax_role_effective is null
  and exists (select 1 from unified_transactions u where u.category_id = t.id and u.date >= date_trunc('year', current_date))
order by 1;
