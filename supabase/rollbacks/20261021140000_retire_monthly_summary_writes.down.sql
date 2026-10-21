-- Rollback zu 20261021140000: die schreibende Funktion (Stand 20260902100001) wiederherstellen.
-- Danach schreibt Sync/Snapshot wieder in monthly_finance_summary; die Oberfläche liest sie nicht mehr.
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

comment on table public.monthly_finance_summary is null;
