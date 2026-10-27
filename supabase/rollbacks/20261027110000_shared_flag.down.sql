-- Rollback zu 20261027110000_shared_flag.sql. ACHTUNG: verwirft die shared-Markierungen (auch den Backfill
-- aus 20261027120000). Vorher Phase-2-Policies, Views und Code zurueckrollen, die shared verwenden.
do $$
declare
  t text;
begin
  foreach t in array array['accounts','valuables','depots','depot_holdings','depot_transactions','savings_plans',
                           'contracts','debts','savings_goals','budget_categories','budget_items','assets']
  loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('alter table public.%I drop column if exists shared', t);
    end if;
  end loop;
end $$;
