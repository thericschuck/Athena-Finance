-- FIX: fn_recompute_account_balances rechnet Bankkonten vom Bank-Anker rueckwaerts (Anker minus alle Buchungen NACH dem Stichtag).
-- Eine Ausgleichsbuchung ("Alter Kontostand - Anfangsbestand ergaenzt", flow_kind anfangsbestand, Datum = Tag vor der ersten
-- Buchung) ist aber keine Bewegung nach dem Anker, sondern der Startwert VOR der ersten Buchung. Zaehlte sie mit, fiel der
-- neu berechnete Verlauf fuer alle Tage vor dem Ausgleichsdatum auf 0 (statt auf den Startwert), obwohl gleicheAbweichungAus
-- zusichert, den Verlauf nicht zu aendern. Jetzt werden anfangsbestand-Zeilen beim Rueckrechnen ausgelassen. Manuelle Konten
-- (Saldo = Summe der Buchungen bis zum Stichtag) bleiben unveraendert: dort IST der Anfangsbestand der Saldo.
-- Beweis (rueckrollender Test, 2026-10-28): fuer alle Konten und acht Stichtage ist der Hash der Salden vorher = nachher, auch mit
-- simulierten Ausgleichsbuchungen fuer Girokonto (+1204,50 am 2024-08-19) und Geschaeftsanteile (+100 am 2018-06-12).
-- Auf der Live-DB am 2026-10-28 per apply_migration angewendet (Name: fix_recompute_anfangsbestand).
-- Rueckgaengig: supabase/rollbacks/20261101110000_fix_recompute_anfangsbestand.down.sql
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
    select
      ut.account_id                     as acc,
      coalesce(ut.booked_date, ut.date) as d,
      ut.signed_amount                  as delta,
      ut.flow_kind                      as fk
    from unified_transactions ut
    where ut.user_id = p_uid
      and ut.account_id is not null

    union all

    select
      ut.transfer_to,
      coalesce(ut.booked_date, ut.date),
      coalesce(ut.amount_base, ut.amount * coalesce(ut.fx_rate, 1)),
      ut.flow_kind
    from unified_transactions ut
    where ut.user_id = p_uid
      and ut.source = 'manual'
      and ut.type = 'transfer'
      and ut.transfer_to is not null
  )
  insert into account_balances (account_id, balance, currency, snapshot_date, source)
  select
    a.id,
    round(case
      when bb.booked_balance is not null then bb.booked_balance - coalesce(seither.s, 0)
      else                                    coalesce(bisher.s, 0)
    end, 2),
    a.currency,
    p_date,
    'cron'
  from accounts a
  left join bank_balance bb
    on  bb.user_id       = a.user_id
    and a.bank_iban     is not null
    and bb.account_iban  = a.bank_iban
  left join lateral (
    select sum(m.delta) as s from mov m
    where m.acc = a.id and m.d <= p_date
  ) bisher on true
  left join lateral (
    select sum(m.delta) as s from mov m
    where m.acc = a.id and m.d > p_date and m.d <= current_date
      and m.fk is distinct from 'anfangsbestand'
  ) seither on true
  where a.user_id = p_uid
    and a.is_active = true
  on conflict (account_id, snapshot_date) do update
    set balance = excluded.balance,
        source  = 'cron';

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$function$;
