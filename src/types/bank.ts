// Bank integration types

export interface BankTransaction {
  id: string
  user_id: string
  account_iban: string
  account_bic: string | null
  amount: number           // positive = credit, negative = debit
  currency: string
  value_date: string       // ISO date string
  entry_date: string | null
  description: string | null
  counterpart_name: string | null
  counterpart_iban: string | null
  counterpart_bic: string | null
  category: string | null
  raw_description: string | null
  external_id: string | null
  created_at: string
}

export interface BankBalance {
  id: string
  user_id: string
  account_iban: string
  account_bic: string | null
  account_name: string | null
  booked_balance: number
  available_balance: number
  currency: string
  fetched_at: string
  created_at: string
}

// ── Sync state ─────────────────────────────────────────────────────────────────
// Decoupled SCA (SecureGo plus Direktfreigabe) is handled server-side by the sidecar,
// so there is no client-facing "enter TAN" step — just loading → success/error.
export type SyncStatus =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; imported: number; skipped: number }
  | { type: 'error'; message: string }

// ── API response shapes ────────────────────────────────────────────────────────
export interface SyncResponse {
  imported?: number
  skipped?: number
  error?: string
}

export interface BalanceResponse {
  balances?: BankBalance[]
  error?: string
}

export interface TransactionsResponse {
  transactions?: BankTransaction[]
  error?: string
}
