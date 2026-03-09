-- ─── depots: benannte Depots pro User ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.depots (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  isin       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, isin)
);

ALTER TABLE public.depots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "depots_own"
  ON public.depots FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_depots_user
  ON public.depots (user_id);
