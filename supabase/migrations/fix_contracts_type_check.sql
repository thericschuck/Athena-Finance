-- Fix contracts_type_check constraint to include all supported contract types.
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_type_check;
ALTER TABLE contracts
  ADD CONSTRAINT contracts_type_check
  CHECK (type IN (
    'subscription',
    'insurance',
    'utility',
    'loan',
    'rental',
    'transfer',
    'savings_plan',
    'building_savings',
    'service',
    'other'
  ));
