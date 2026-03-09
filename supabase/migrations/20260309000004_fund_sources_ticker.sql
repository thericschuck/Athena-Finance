-- Ticker-Spalte für Yahoo Finance (wird automatisch befüllt und gecacht)
ALTER TABLE public.fund_sources ADD COLUMN IF NOT EXISTS ticker TEXT;
