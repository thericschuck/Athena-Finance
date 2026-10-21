-- Rollback zu 20261021100000_category_tree.sql. Erst 20261021110000 und 20261021120000 zurückrollen
-- (sie hängen von dieser View ab).
drop view if exists public.category_tree;
drop index if exists public.categories_user_idx;
