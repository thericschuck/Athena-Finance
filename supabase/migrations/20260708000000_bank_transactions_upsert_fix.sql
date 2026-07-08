-- Fix bank_transactions upsert.
--
-- The dedup index was PARTIAL (`where external_id is not null`). PostgREST's upsert
-- `on_conflict=user_id,external_id` generates `ON CONFLICT (user_id, external_id)` with no
-- predicate, which Postgres refuses to match against a partial index:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification".
--
-- Replace it with a plain (non-partial) unique index. The sync always populates external_id,
-- and NULLs remain distinct in a unique index, so there is no behavioral regression.

drop index if exists bank_transactions_external_id_idx;

create unique index if not exists bank_transactions_external_id_idx
  on bank_transactions (user_id, external_id);
