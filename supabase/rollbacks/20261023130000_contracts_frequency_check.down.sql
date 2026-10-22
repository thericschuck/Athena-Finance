-- Rollback zu 20261023130000_contracts_frequency_check.sql. Schlaegt fehl, wenn inzwischen Vertraege mit yearly/biweekly/biannual existieren;
-- dann diese zuerst aendern.
alter table public.contracts drop constraint if exists contracts_frequency_check;
alter table public.contracts
  add constraint contracts_frequency_check
  check (frequency = any (array['monthly', 'quarterly', 'annually', 'weekly']));
