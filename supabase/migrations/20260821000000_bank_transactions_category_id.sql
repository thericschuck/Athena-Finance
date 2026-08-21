-- bank_transactions.category was a free-text string produced by a hardcoded keyword list
-- that never matched the user's real Finance categories (see categories table) — e.g. it
-- invented labels like "Shopping" or "Gehalt & Einkommen" that don't exist there at all.
-- This adds a proper FK so bank transactions can reuse the same categories (name/color/icon)
-- as the rest of the Finance module instead of a disconnected shadow taxonomy.
--
-- The old `category` text column is left in place (unused going forward, harmless) rather
-- than backfilled: several of the user's categories share a name with two different ids
-- (leftover duplicates), so an automatic name-based backfill could silently attach existing
-- transactions to the wrong duplicate. Existing rows go back to "uncategorized" and get
-- re-suggested (and reviewed) via the category-suggestions flow instead.

alter table public.bank_transactions
  add column category_id uuid references public.categories(id) on delete set null;

create index if not exists bank_transactions_category_id_idx
  on public.bank_transactions (category_id);
