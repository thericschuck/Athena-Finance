-- ─── depot_transactions: add transaction_type ─────────────────────────────
ALTER TABLE public.depot_transactions
  ADD COLUMN IF NOT EXISTS transaction_type TEXT NOT NULL DEFAULT 'buy'
  CHECK (transaction_type IN ('initial', 'buy', 'savings_plan'));

-- ─── savings_plans ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.savings_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  isin            TEXT NOT NULL,
  fund_name       TEXT NOT NULL,
  monthly_amount  NUMERIC(10, 2) NOT NULL,
  execution_day   INT NOT NULL CHECK (execution_day BETWEEN 1 AND 28),
  start_date      DATE NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.savings_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "savings_plans_own"
  ON public.savings_plans FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_savings_plans_user
  ON public.savings_plans (user_id);

-- ─── fund_price_cache ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fund_price_cache (
  isin        TEXT PRIMARY KEY,
  fund_name   TEXT NOT NULL,
  price       NUMERIC(12, 4) NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'EUR',
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.fund_price_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fund_price_cache_read"
  ON public.fund_price_cache FOR SELECT
  USING (true);

-- Service Role writes via SUPABASE_SERVICE_ROLE_KEY (bypasses RLS)
-- No INSERT/UPDATE policy needed for anon/authenticated; Edge Function uses service role
