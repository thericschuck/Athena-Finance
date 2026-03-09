-- ─── fund_prices ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fund_prices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isin        TEXT NOT NULL,
  fund_name   TEXT NOT NULL,
  price       NUMERIC(12, 4) NOT NULL,
  price_date  DATE NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'EUR',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (isin, price_date)
);

ALTER TABLE public.fund_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fund_prices_select_all"
  ON public.fund_prices FOR SELECT
  USING (true);

CREATE POLICY "fund_prices_insert_auth"
  ON public.fund_prices FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "fund_prices_update_auth"
  ON public.fund_prices FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "fund_prices_delete_auth"
  ON public.fund_prices FOR DELETE
  USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_fund_prices_isin_date
  ON public.fund_prices (isin, price_date);

-- ─── depot_transactions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.depot_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  isin             TEXT NOT NULL,
  fund_name        TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  amount_eur       NUMERIC(12, 2) NOT NULL,
  price_per_share  NUMERIC(12, 4) NOT NULL,
  shares           NUMERIC(16, 6) GENERATED ALWAYS AS (amount_eur / price_per_share) STORED,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.depot_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "depot_transactions_own"
  ON public.depot_transactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_depot_transactions_user_date
  ON public.depot_transactions (user_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_depot_transactions_isin
  ON public.depot_transactions (isin);