/**
 * Monatssummen auf `flow_kind = 'echt'` umgestellt.
 *
 * Vorher `ut.type <> 'transfer'`: damit landeten Bauspar-Einzahlungen, Krypto-Käufe,
 * Schuldenrückzahlungen und die drei Anfangsbestände in `total_income` und
 * `total_expenses`. Die Tabelle ist die Grundlage für die Sparquote und die
 * Finanzanalyse auf dem Dashboard — beide zeigten dadurch zu große Zahlen.
 * März 2026: GuV +6.221,91 € vorher, −450,09 € nachher.
 *
 * `savings_transfer` bleibt als Spalte erhalten, wird aber praktisch leer: die
 * Buchungen, die sie gefüllt haben (Kategorien mit „sparen"/„übertrag"), sind
 * jetzt `anlage` und damit gar keine Ausgabe mehr. Die Spalte nicht zu entfernen
 * ist Absicht — die Historie davor soll lesbar bleiben.
 *
 * Gegenüber der Vorversion ist genau eine Zeile geändert: der Filter in der
 * Unterabfrage. Alles andere ist unverändert übernommen.
 */
create or replace function public.fn_recompute_monthly_summary(p_uid uuid, p_month date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into monthly_finance_summary (
    user_id, month, source,
    salary, food, leisure, subscriptions, savings_transfer, pocket_money,
    other_income, other_expenses, total_income, total_expenses
  )
  select
    p_uid,
    date_trunc('month', p_month)::date,
    'cron',
    round(coalesce(sum(case when t.typ = 'income'
      and (t.cname like '%gehalt%' or t.cname like '%lohn%' or t.cname like '%salary%')
      then t.amt end), 0), 2),
    round(coalesce(sum(case when t.typ = 'expense'
      and (t.cname like '%lebensmittel%' or t.cname like '%supermarkt%'
        or t.cname like '%food%' or t.cname like '%groceries%')
      then t.amt end), 0), 2),
    round(coalesce(sum(case when t.typ = 'expense'
      and (t.cname like '%freizeit%' or t.cname like '%leisure%'
        or t.cname like '%entertainment%' or t.cname like '%sport%' or t.cname like '%hobby%')
      then t.amt end), 0), 2),
    round(coalesce(sum(case when t.typ = 'expense'
      and (t.cname like '%abo%' or t.cname like '%subscription%'
        or t.cname like '%streaming%' or t.cname like '%software%' or t.cname like '%mitglied%')
      then t.amt end), 0), 2),
    round(coalesce(sum(case
      when t.cname like '%sparen%' or t.cname like '%saving%'
        or t.cname like '%übertrag%' or t.cname like '%transfer%'
      then t.amt end), 0), 2),
    round(coalesce(sum(case when t.typ = 'expense'
      and (t.cname like '%taschengeld%' or t.cname like '%pocket%')
      then t.amt end), 0), 2),
    round(coalesce(sum(case when t.typ = 'income'
      and t.cname not like '%gehalt%' and t.cname not like '%lohn%'
      and t.cname not like '%salary%' and t.cname not like '%sparen%'
      and t.cname not like '%saving%' and t.cname not like '%übertrag%'
      then t.amt end), 0), 2),
    round(coalesce(sum(case when t.typ = 'expense'
      and t.cname not like '%lebensmittel%' and t.cname not like '%supermarkt%'
      and t.cname not like '%food%'         and t.cname not like '%groceries%'
      and t.cname not like '%freizeit%'     and t.cname not like '%leisure%'
      and t.cname not like '%sport%'        and t.cname not like '%hobby%'
      and t.cname not like '%abo%'          and t.cname not like '%subscription%'
      and t.cname not like '%streaming%'    and t.cname not like '%mitglied%'
      and t.cname not like '%sparen%'       and t.cname not like '%saving%'
      and t.cname not like '%übertrag%'     and t.cname not like '%transfer%'
      and t.cname not like '%taschengeld%'  and t.cname not like '%pocket%'
      then t.amt end), 0), 2),
    round(coalesce(sum(case when t.typ = 'income'  then t.amt end), 0), 2),
    round(coalesce(sum(case when t.typ = 'expense' then t.amt end), 0), 2)
  from (
    select
      ut.type                                                       as typ,
      lower(coalesce(ut.category_name, ''))                         as cname,
      coalesce(ut.amount_base, ut.amount * coalesce(ut.fx_rate, 1)) as amt
    from unified_transactions ut
    where ut.user_id = p_uid
      and ut.date >= date_trunc('month', p_month)::date
      and ut.date <  (date_trunc('month', p_month) + interval '1 month')::date
      -- Nur echte Einnahmen und Ausgaben. Schließt Umbuchungen, Anlagen,
      -- Forderungen und Anfangsbestände aus — siehe unified_transactions.flow_kind.
      and ut.flow_kind = 'echt'
  ) t
  on conflict (user_id, month) do update set
    salary           = excluded.salary,
    food             = excluded.food,
    leisure          = excluded.leisure,
    subscriptions    = excluded.subscriptions,
    savings_transfer = excluded.savings_transfer,
    pocket_money     = excluded.pocket_money,
    other_income     = excluded.other_income,
    other_expenses   = excluded.other_expenses,
    total_income     = excluded.total_income,
    total_expenses   = excluded.total_expenses,
    source           = 'cron';
end;
$function$;

-- Historie nachziehen: alle Monate mit Buchungen neu rechnen.
do $$
declare r record;
begin
  for r in
    select distinct user_id, date_trunc('month', date)::date as monat
    from unified_transactions
  loop
    perform fn_recompute_monthly_summary(r.user_id, r.monat);
  end loop;
end $$;
