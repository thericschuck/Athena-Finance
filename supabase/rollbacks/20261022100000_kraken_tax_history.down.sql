-- Rollback zu 20261022100000_kraken_tax_history.sql. Loescht die gespeicherte Kraken-Historie;
-- sie laesst sich ueber den Kraken-Sync wieder aufbauen.
drop table if exists public.kraken_ledger;
drop table if exists public.kraken_trades;
