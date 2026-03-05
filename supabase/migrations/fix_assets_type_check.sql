-- Fix assets_type_check constraint to include 'fiat' and 'stable' types.
-- Run this in the Supabase SQL Editor.

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_type_check;

ALTER TABLE assets
  ADD CONSTRAINT assets_type_check
  CHECK (type IN ('crypto', 'stable', 'fiat', 'stock', 'real_estate', 'cash', 'other'));
