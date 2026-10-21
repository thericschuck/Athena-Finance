-- Rollback zu 20261021150000_categories_business_share.sql. Gesetzte Anteile gehen verloren.
alter table public.categories drop constraint if exists categories_business_share_range;
alter table public.categories drop column if exists business_share;
