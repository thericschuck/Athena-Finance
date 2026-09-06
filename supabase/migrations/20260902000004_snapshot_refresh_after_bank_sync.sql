/**
 * Nach jedem Bank-Sync den heutigen Snapshot nachziehen.
 *
 * `fn_ensure_linked_account` schreibt bei jedem Sync `account_balances` für heute
 * fort — der Kommentar dort sagt sogar, das sei so, damit fn_take_snapshot die
 * Salden „automatisch" mitnimmt. Nur ruft niemand fn_take_snapshot danach auf.
 * Ergebnis: zwischen einem Sync und dem nächtlichen Cron um 23:59 zeigt
 * `net_worth_snapshots` für heute einen veralteten Stand.
 *
 * Gemessen am 2026-09-02: der Sync um 09:50 hob das geteilte Konto von 1.920,70 €
 * auf 1.945,70 €, die Snapshot-Zeile für heute blieb bei 1.920,70 €. Das Dashboard
 * rechnet live und war richtig, die Verlaufstabelle unter /analyse/verlauf und
 * Athenas getNetWorthTrend lasen die Snapshot-Zeile und lagen 25 € daneben.
 *
 * FOR EACH STATEMENT, nicht FOR EACH ROW: ein Sync schreibt mehrere Konten, und
 * pro Zeile einen vollständigen Snapshot zu rechnen wäre Verschwendung.
 *
 * Der Exception-Block ist Absicht. Der Trigger läuft in der Sync-Transaktion —
 * ohne ihn würde ein Fehler in fn_take_snapshot den ganzen Bank-Sync scheitern
 * lassen. Ein veralteter Snapshot ist ärgerlich, ein blockierter Bank-Sync ist
 * schlimmer; die Warnung landet im Postgres-Log.
 */
create or replace function public.fn_snapshot_after_bank_sync()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  begin
    perform fn_take_snapshot(current_date);
  exception when others then
    raise warning 'fn_snapshot_after_bank_sync: Snapshot nicht aktualisiert (%)', sqlerrm;
  end;
  return null;
end;
$function$;

drop trigger if exists trg_snapshot_after_bank_sync on bank_balance;
create trigger trg_snapshot_after_bank_sync
  after insert or update on bank_balance
  for each statement
  execute function fn_snapshot_after_bank_sync();
