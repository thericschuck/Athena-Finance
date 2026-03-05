-- Fix accounts_type_check constraint to include building_savings type.
-- Run this in the Supabase SQL Editor.

ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_type_check;

ALTER TABLE accounts
  ADD CONSTRAINT accounts_type_check
  CHECK (type IN ('checking', 'savings', 'building_savings', 'investment', 'crypto', 'cash', 'credit', 'other'));
