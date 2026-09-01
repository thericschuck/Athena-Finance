// Bank integration types

export interface BankTransaction {
  id: string
  user_id: string
  bank_label?: string | null  // which FinTS login this came from (null = primary bank)
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
  category_id: string | null
  raw_description: string | null
  external_id: string | null
  bank_reference?: string | null  // AcctSvcrRef/tag-61 reference; stable dedup key once present
  created_at: string
}

export interface BankBalance {
  id: string
  user_id: string
  bank_label?: string | null  // which FinTS login this came from (null = primary bank)
  account_iban: string
  account_bic: string | null
  account_name: string | null
  booked_balance: number
  available_balance: number
  currency: string
  fetched_at: string
  created_at: string
  /**
   * ID des verknüpften Kontos aus `accounts` (über accounts.bank_iban, siehe Migration
   * 20260821010000). Wird von /api/bank/balance nachgereicht, damit von der Banking-Seite
   * auf die Kontodetailseite unter Finance verlinkt werden kann — sonst zeigen beide
   * Bereiche dasselbe Konto, ohne dass man zwischen ihnen wechseln kann.
   */
  account_id?: string | null
}

// ── Depot holdings (auto-synced via FinTS HKWPD, e.g. Union Investment) ────────
// Point-in-time snapshot, not a ledger — overwritten on every sync, unlike
// BankTransaction. Separate from the manually-entered depot module.
export interface DepotHolding {
  id: string
  user_id: string
  bank_label?: string | null  // which FinTS login this came from (null = primary bank)
  account_label: string | null
  account_number: string | null
  isin: string
  name: string | null
  pieces: number | null
  market_value: number | null
  currency: string
  valuation_date: string | null
  total_value: number | null
  acquisition_price: number | null
  external_id: string
  fetched_at: string
  created_at: string
}

// ── Sync state ─────────────────────────────────────────────────────────────────
// Decoupled SCA (SecureGo plus Direktfreigabe) is handled server-side by the sidecar,
// so there is no client-facing "enter TAN" step — just loading → success/error.
export type SyncStatus =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; imported: number; skipped: number; warnings?: string[] }
  | { type: 'error'; message: string }

// ── API response shapes ────────────────────────────────────────────────────────
export interface SyncResponse {
  imported?: number
  skipped?: number
  holdingsSynced?: number
  /** e.g. "Bank 2: PIN/Zugangsdaten wurden von der Bank abgelehnt." — that bank's
   *  sync failed but others in the same run still succeeded. */
  warnings?: string[]
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

export interface DepotHoldingsResponse {
  holdings?: DepotHolding[]
  error?: string
}

// ── Finance categories (shared with the Finance module's `categories` table) ───
export interface FinanceCategory {
  id: string
  name: string
  type: string  // 'expense' | 'income' | 'neutral'
  color: string | null
  icon: string | null
  parent_id: string | null
}

export interface CategoriesResponse {
  categories?: FinanceCategory[]
  error?: string
}

// ── Category suggestions (bulk auto-categorize review) ─────────────────────────
export interface CategorySuggestion {
  id: string
  description: string | null
  counterpart_name: string | null
  amount: number
  value_date: string
  current_category: FinanceCategory | null   // null if uncategorized
  suggested_category: FinanceCategory        // always different from current_category
}

export interface SuggestCategoriesResponse {
  suggestions?: CategorySuggestion[]
  error?: string
}
