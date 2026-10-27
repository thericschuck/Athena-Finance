-- Rollback zu 20261027120000_household_backfill.sql: Konto wieder auf shared = false, Haushalt 'Haushalt Schuck'
-- samt Mitgliedschaften loeschen (cascade). Spaeter hinzugekommene Mitglieder gehen dabei mit verloren.
update public.accounts set shared = false where name ilike 'Geteiltes Konto (Malik)' and shared;
delete from public.households where name = 'Haushalt Schuck';
