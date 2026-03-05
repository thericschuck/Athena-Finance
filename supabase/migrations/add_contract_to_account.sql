-- Add to_account_id to contracts table for Dauerauftrag / Sparplan / Bausparvertrag-Einzahlungen.
-- Run this in the Supabase SQL Editor.

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS to_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
