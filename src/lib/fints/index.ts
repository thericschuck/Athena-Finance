/**
 * Server-side FinTS/HBCI service — never import in client components.
 *
 * Backed by a Python sidecar (scripts/fints/fints_sync.py via ./sidecar) using python-fints,
 * because the target bank (Atruvia / Frankfurter Volksbank Rhein/Main, Raiffeisenbank family)
 * requires decoupled SCA (SecureGo plus Direktfreigabe) and camt.052 statements — neither of
 * which the Node `node-fints` library supports.
 *
 * Required env vars: FINTS_URL, FINTS_BLZ, FINTS_USERNAME, FINTS_PIN
 * Recommended:        FINTS_PRODUCT_ID (a ZKA/DK-registered product ID; this bank effectively
 *                     requires one, otherwise it rejects with 9050/9075/9800/9340).
 * Optional:           FINTS_PYTHON (path to a Python interpreter; defaults to scripts/fints/.venv).
 *
 * Flow: the sidecar performs the whole dialog synchronously, including polling the bank while
 * the user approves the decoupled push in their banking app. Calls may therefore block for up
 * to a few minutes. There is no separate "enter TAN" step for decoupled methods.
 */

import { categorize } from './categorize'
import { runSidecar, type SidecarAccount, type SidecarTransaction } from './sidecar'

// ── Error helpers ────────────────────────────────────────────────────────────

export interface FinTSErrorDetails {
  message: string
  errors: string[]
  debugString?: string
}

export function getFinTSErrorDetails(err: unknown): FinTSErrorDetails {
  const message = err instanceof Error ? err.message : String(err)
  return { message, errors: [] }
}

// ── Public types ───────────────────────────────────────────────────────────────

export interface SEPAAccount {
  iban: string
  bic: string
  accountNumber: string
  blz: string
  accountName?: string
}

export interface FetchedBalance {
  iban: string
  bic: string
  accountName: string
  bookedBalance: number
  availableBalance: number
  currency: string
}

export interface ParsedTransaction {
  accountIban: string
  accountBic: string
  amount: number           // positive = credit, negative = debit
  currency: string
  valueDate: string        // ISO date
  entryDate: string | null
  description: string
  counterpartName: string | null
  counterpartIban: string | null
  counterpartBic: string | null
  category: string | null
  rawDescription: string
  externalId: string
}

export interface SyncResult {
  transactions: ParsedTransaction[]
  accounts: SEPAAccount[]
}

// ── Mapping ──────────────────────────────────────────────────────────────────

function buildExternalId(iban: string, valueDate: string, amount: number, description: string): string {
  const raw = `${iban}|${valueDate}|${amount}|${description.substring(0, 100)}`
  return Buffer.from(raw).toString('base64')
}

function mapAccount(acc: SidecarAccount): SEPAAccount {
  return {
    iban:          acc.iban ?? '',
    bic:           acc.bic ?? '',
    accountNumber: acc.accountNumber ?? '',
    blz:           acc.blz ?? '',
    accountName:   acc.accountName ?? undefined,
  }
}

function mapTransaction(tx: SidecarTransaction): ParsedTransaction {
  const iban       = tx.accountIban ?? ''
  const amount     = tx.amount ?? 0
  const valueDate  = tx.valueDate ?? ''
  const desc       = tx.description ?? ''

  return {
    accountIban:    iban,
    accountBic:     tx.accountBic ?? '',
    amount,
    currency:       tx.currency || 'EUR',
    valueDate,
    entryDate:      tx.entryDate ?? null,
    description:    desc,
    counterpartName: tx.counterpartName ?? null,
    counterpartIban: tx.counterpartIban ?? null,
    counterpartBic:  tx.counterpartBic ?? null,
    category:       categorize(tx.counterpartName ?? undefined) ?? categorize(desc),
    rawDescription: desc,
    externalId:     buildExternalId(iban, valueDate, amount, desc),
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Fetches account balances for all accounts. Does not require a typed TAN, but may trigger
 * (and wait for) a decoupled app approval depending on the bank.
 */
export async function fetchBalances(): Promise<FetchedBalance[]> {
  const result = await runSidecar({ balances: true, skipTransactions: true })
  return result.balances
    .filter(b => b.iban)
    .map(b => {
      const account = result.accounts.find(a => a.iban === b.iban)
      return {
        iban:             b.iban ?? '',
        bic:              b.bic ?? '',
        accountName:      account?.accountName ?? account?.accountNumber ?? (b.iban ?? ''),
        bookedBalance:    b.bookedBalance ?? 0,
        availableBalance: b.availableBalance ?? b.bookedBalance ?? 0,
        currency:         b.currency || 'EUR',
      }
    })
}

/**
 * Performs a full transaction sync. The sidecar drives the entire dialog, including waiting
 * for a decoupled app approval if the bank requires one, so this resolves only once the data
 * has been retrieved (or rejects on error/timeout).
 */
export async function startSync(
  startDate?: Date,
  endDate?: Date,
): Promise<SyncResult> {
  const result = await runSidecar({ startDate, endDate })
  return {
    accounts:     result.accounts.map(mapAccount),
    transactions: result.transactions.map(mapTransaction),
  }
}

/**
 * Upserts parsed transactions for a user, deduplicated by (user_id, external_id).
 * Shared by the interactive sync route (cookie-scoped client) and the cron route
 * (service-role admin client) — pass whichever Supabase client fits the caller.
 */
export async function upsertBankTransactions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  transactions: ParsedTransaction[],
): Promise<{ imported: number; skipped: number }> {
  if (transactions.length === 0) return { imported: 0, skipped: 0 }

  const rows = transactions.map(tx => ({
    user_id:          userId,
    account_iban:     tx.accountIban,
    account_bic:      tx.accountBic,
    amount:           tx.amount,
    currency:         tx.currency,
    value_date:       tx.valueDate,
    entry_date:       tx.entryDate,
    description:      tx.description,
    counterpart_name: tx.counterpartName,
    counterpart_iban: tx.counterpartIban,
    counterpart_bic:  tx.counterpartBic,
    category:         tx.category,
    raw_description:  tx.rawDescription,
    external_id:      tx.externalId,
  }))

  const { data, error } = await supabase
    .from('bank_transactions')
    .upsert(rows, { onConflict: 'user_id,external_id', ignoreDuplicates: true })
    .select('id')

  if (error) throw new Error(error.message)

  const imported = (data as { id: string }[] | null)?.length ?? 0
  const skipped  = rows.length - imported
  return { imported, skipped }
}
