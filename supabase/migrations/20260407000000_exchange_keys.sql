-- Exchange API keys table
-- Stores encrypted API credentials for connected exchanges (e.g. Kraken)
-- api_key and api_secret are AES-256-GCM encrypted server-side before insertion

CREATE TABLE public.exchange_keys (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  exchange    TEXT        NOT NULL,
  api_key     TEXT        NOT NULL,
  api_secret  TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, exchange)
);

ALTER TABLE public.exchange_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own exchange keys"
  ON public.exchange_keys
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
