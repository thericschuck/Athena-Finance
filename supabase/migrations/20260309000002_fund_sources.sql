-- ─── fund_sources: konfigurierbare Fonds-Quellen mit XPath ────────────────
CREATE TABLE IF NOT EXISTS public.fund_sources (
  isin        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  xpath       TEXT NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'EUR',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.fund_sources ENABLE ROW LEVEL SECURITY;

-- Jeder authentifizierte User darf Quellen lesen (öffentliche Kursdaten)
CREATE POLICY "fund_sources_read"
  ON public.fund_sources FOR SELECT
  USING (true);

-- Edge Function (Service Role) darf schreiben, kein INSERT-Policy für User nötig

-- UniGlobal als erste Quelle eintragen
INSERT INTO public.fund_sources (isin, name, url, xpath) VALUES (
  'DE0008491051',
  'UniGlobal',
  'https://www.finanzen.net/fonds/uniglobal-de0008491051',
  '/html/body/main/section[1]/div[1]/div/div[6]/span[1]/span[1]'
) ON CONFLICT (isin) DO NOTHING;
