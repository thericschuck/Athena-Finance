-- Rollback zu 20261101110000_fix_recompute_anfangsbestand.sql: urspruengliche Fassung von fn_recompute_account_balances
-- (Anfangsbestaende zaehlen beim Rueckrechnen vom Bank-Anker mit).
create or replace function public.fn_recompute_account_balances(p_uid uuid, p_date date)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_rows integer;
begin
  with mov as (
    select ut.account_id as acc, coalesce(ut.booked_date, ut.date) as d, ut.signed_amount as delta
    from unified_transactions ut
    where ut.user_id = p_uid and ut.account_id is not null
    union all
    select ut.transfer_to, coalesce(ut.booked_date, ut.date),
           coalesce(ut.amount_base, ut.amount * coalesce(ut.fx_rate, 1))
    from unified_transactions ut
    where ut.user_id = p_uid and ut.source = 'manual' and ut.type = 'transfer' and ut.transfer_to is not null
  )
  insert into account_balances (account_id, balance, currency, snapshot_date, source)
  select a.id,
    round(case when bb.booked_balance is not null then bb.booked_balance - coalesce(seither.s, 0)
               else coalesce(bisher.s, 0) end, 2),
    a.currency, p_date, 'cron'
  from accounts a
  left join bank_balance bb on bb.user_id = a.user_id and a.bank_iban is not null and bb.account_iban = a.bank_iban
  left join lateral (select sum(m.delta) as s from mov m where m.acc = a.id and m.d <= p_date) bisher on true
  left join lateral (select sum(m.delta) as s from mov m where m.acc = a.id and m.d > p_date and m.d <= current_date) seither on true
  where a.user_id = p_uid and a.is_active = true
  on conflict (account_id, snapshot_date) do update set balance = excluded.balance, source = 'cron';
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$function$;
