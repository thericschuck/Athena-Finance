/**
 * contracts.frequency: die Werte zulassen, die die App anbietet und rechnet.
 *
 * Die Pruefung erlaubte nur monthly, quarterly, annually und weekly. Das Formular, die Faelligkeitsrechnung (recurrence.ts, termine.ts)
 * und der Cron kennen aber weekly, biweekly, monthly, quarterly, biannual und YEARLY ("annually" kennt kein Code): jaehrliche,
 * halbjaehrliche und zweiwoechentliche Vertraege liessen sich deshalb nicht anlegen (check violation). 'annually' bleibt zugelassen,
 * damit nichts Altes bricht (es gibt keine Zeile damit).
 *
 * Rollback: supabase/rollbacks/20261023130000_contracts_frequency_check.down.sql
 */
alter table public.contracts drop constraint if exists contracts_frequency_check;
alter table public.contracts
  add constraint contracts_frequency_check
  check (frequency = any (array['weekly', 'biweekly', 'monthly', 'quarterly', 'biannual', 'yearly', 'annually']));
