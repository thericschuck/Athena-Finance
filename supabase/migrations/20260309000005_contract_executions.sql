-- Protokolliert automatische Buchungen von Verträgen und Sparplänen
CREATE TABLE IF NOT EXISTS public.contract_executions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id     UUID        NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  execution_date  DATE        NOT NULL,
  transaction_id  UUID,       -- Referenz auf erstellte Transaktion (optional)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id, execution_date)
);

ALTER TABLE public.contract_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contract_executions_own"
  ON public.contract_executions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_id AND c.user_id = auth.uid()
    )
  );
