/**
 * Manual type definition for the `exchange_keys` table.
 * This file can be deleted once `supabase gen types typescript` is run
 * after applying migration 20260407000000_exchange_keys.sql.
 */
export interface ExchangeKeyRow {
  id:         string
  user_id:    string
  exchange:   string
  api_key:    string
  api_secret: string
  created_at: string
}

export interface ExchangeKeyInsert {
  user_id:    string
  exchange:   string
  api_key:    string
  api_secret: string
  id?:        string
  created_at?: string
}
