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

import { suggestCategory, type LearnedCategoryMap } from './categorize'
import { runSidecar, type SidecarAccount, type SidecarTransaction, type SidecarHolding } from './sidecar'
import type { FinanceCategory } from '@/types/bank'

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
  bankLabel?: string
  iban: string
  bic: string
  accountNumber: string
  blz: string
  accountName?: string
}

export interface FetchedBalance {
  bankLabel: string | null
  iban: string
  bic: string
  accountName: string
  bookedBalance: number
  availableBalance: number
  currency: string
}

export interface ParsedTransaction {
  bankLabel: string | null
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
  categoryId: string | null
  rawDescription: string
  bankReference: string | null
  externalId: string
}

/**
 * A single securities depot position (e.g. a fund held in a Union Investment
 * "UnionDepot"), discovered alongside the regular SEPA accounts because it sits
 * under the same FinTS login. This is a snapshot, not a transaction — each sync
 * overwrites the previous snapshot per (user, externalId) rather than appending.
 */
export interface ParsedHolding {
  bankLabel: string | null
  accountLabel: string
  accountNumber: string | null
  isin: string
  name: string
  pieces: number | null
  marketValue: number | null
  currency: string
  valuationDate: string | null
  totalValue: number | null
  acquisitionPrice: number | null
  externalId: string
}

export interface SyncResult {
  transactions: ParsedTransaction[]
  accounts: SEPAAccount[]
  holdings: ParsedHolding[]
  /** One message per configured bank that failed this sync (others still succeed). */
  warnings: string[]
}

// ── Mapping ──────────────────────────────────────────────────────────────────

// Prefers the bank's own reference (AcctSvcrRef/camt.052, tag-61 bank_reference/MT940) — it's
// assigned once per posting and never changes on a later re-fetch. The free-text purpose does
// NOT have that guarantee (observed: the bank appended "SecureGo plus IBAN: ..." to a transfer's
// note between two syncs of the very same transaction), so it's now only a last-resort fallback
// for the rare line that has no reference at all — hashing it as the primary key is what caused
// the same real transaction to be inserted twice and inflate the monthly totals.
function buildExternalId(
  iban: string, bankReference: string | null, valueDate: string, amount: number, description: string,
): string {
  const raw = bankReference
    ? `${iban}|ref|${bankReference}`
    : `${iban}|${valueDate}|${amount}|${description.substring(0, 100)}`
  return Buffer.from(raw).toString('base64')
}

function mapAccount(acc: SidecarAccount): SEPAAccount {
  return {
    bankLabel:     acc.bankLabel ?? undefined,
    iban:          acc.iban ?? '',
    bic:           acc.bic ?? '',
    accountNumber: acc.accountNumber ?? '',
    blz:           acc.blz ?? '',
    accountName:   acc.accountName ?? undefined,
  }
}

function buildHoldingExternalId(accountNumber: string, isin: string): string {
  return Buffer.from(`${accountNumber}|${isin}`).toString('base64')
}

function mapHolding(h: SidecarHolding): ParsedHolding | null {
  // ISIN is the one field we can't do anything useful without.
  if (!h.isin) return null
  const accountNumber = h.accountNumber ?? ''
  return {
    bankLabel:        h.bankLabel ?? null,
    accountLabel:     h.accountLabel ?? 'Depot',
    accountNumber:    h.accountNumber ?? null,
    isin:             h.isin,
    name:             h.name ?? h.isin,
    pieces:           h.pieces ?? null,
    marketValue:      h.marketValue ?? null,
    currency:         h.currency || 'EUR',
    valuationDate:    h.valuationDate ?? null,
    totalValue:       h.totalValue ?? null,
    acquisitionPrice: h.acquisitionPrice ?? null,
    externalId:       buildHoldingExternalId(accountNumber, h.isin),
  }
}

// bank_transactions.value_date and .account_iban are both NOT NULL, and account_iban is the
// join key every chart/filter on the Banking page relies on. A transaction missing either
// isn't just incomplete — coalescing it to '' would either violate the date column's type
// (Postgres rejects '' for `date`, aborting the *entire* upsert batch, not just this row) or
// silently corrupt account grouping. So this drops the row instead of ever writing '' for it.
function mapTransaction(tx: SidecarTransaction, categories: FinanceCategory[], learnedMap: LearnedCategoryMap): ParsedTransaction | null {
  // A missing amount isn't "zero" — it means the sidecar couldn't parse this statement
  // line, and defaulting to 0 would silently inject a phantom transaction into every
  // sum/chart on the Banking page instead of surfacing the parse failure.
  if (!tx.valueDate || !tx.accountIban || tx.amount == null) return null

  const iban          = tx.accountIban
  const amount         = tx.amount
  const valueDate      = tx.valueDate
  const desc           = tx.description ?? ''
  const bankReference  = tx.bankReference ?? null

  return {
    bankLabel:      tx.bankLabel ?? null,
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
    categoryId:     suggestCategory(tx.counterpartName, desc, categories, learnedMap)?.id ?? null,
    rawDescription: desc,
    bankReference,
    externalId:     buildExternalId(iban, bankReference, valueDate, amount, desc),
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
        bankLabel:        b.bankLabel ?? null,
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
  categories: FinanceCategory[] = [],
  learnedMap: LearnedCategoryMap = new Map(),
): Promise<SyncResult> {
  const result = await runSidecar({ startDate, endDate })

  const transactions = result.transactions
    .map(tx => mapTransaction(tx, categories, learnedMap))
    .filter((t): t is ParsedTransaction => t !== null)
  const droppedTxns = result.transactions.length - transactions.length
  if (droppedTxns > 0) {
    console.warn(`[fints] ${droppedTxns} Transaktion(en) ohne Datum/IBAN/Betrag verworfen (nicht speicherbar).`)
  }

  return {
    accounts:     result.accounts.map(mapAccount),
    transactions,
    holdings:     result.holdings.map(mapHolding).filter((h): h is ParsedHolding => h !== null),
    warnings:     result.warnings ?? [],
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

  // Legacy bridge: rows synced before bank_reference existed were deduped by hashing the
  // free-text purpose (see buildExternalId's comment), which the bank has been observed to
  // rewrite on a later fetch of the very same posting. Those rows' external_id won't match
  // what today's bank_reference-based hash produces for that same transaction, so a blind
  // upsert would insert a second copy of it. Backfill the reference onto the existing row
  // instead — but only for an unambiguous 1:1 match on (iban, date, amount); if two+ legacy
  // rows already share that key (e.g. two coincidentally same-amount card payments on one
  // day), there's no way to tell which incoming reference belongs to which, so those are left
  // alone rather than risk merging two genuinely different transactions into one.
  const { data: legacyRows, error: legacyErr } = await supabase
    .from('bank_transactions')
    .select('id, account_iban, value_date, amount')
    .eq('user_id', userId)
    .is('bank_reference', null)

  if (legacyErr) throw new Error(legacyErr.message)

  const legacyByKey = new Map<string, string[]>()
  for (const row of (legacyRows ?? []) as { id: string; account_iban: string; value_date: string; amount: number }[]) {
    const key = `${row.account_iban}|${row.value_date}|${row.amount}`
    const ids = legacyByKey.get(key)
    if (ids) ids.push(row.id)
    else legacyByKey.set(key, [row.id])
  }

  const toInsert: ParsedTransaction[] = []
  let reconciled = 0

  for (const tx of transactions) {
    const key = `${tx.accountIban}|${tx.valueDate}|${tx.amount}`
    const candidateIds = tx.bankReference ? legacyByKey.get(key) : undefined

    if (candidateIds?.length === 1) {
      const { error } = await supabase
        .from('bank_transactions')
        .update({
          bank_reference:  tx.bankReference,
          external_id:     tx.externalId,
          description:     tx.description,
          raw_description: tx.rawDescription,
          entry_date:      tx.entryDate,
          bank_label:      tx.bankLabel,
        })
        .eq('id', candidateIds[0])
      if (error) throw new Error(error.message)
      legacyByKey.delete(key) // this legacy row is spoken for; don't match another tx to it
      reconciled++
    } else {
      toInsert.push(tx)
    }
  }

  if (toInsert.length === 0) return { imported: 0, skipped: reconciled }

  const rows = toInsert.map(tx => ({
    user_id:          userId,
    bank_label:       tx.bankLabel,
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
    category_id:      tx.categoryId,
    raw_description:  tx.rawDescription,
    bank_reference:   tx.bankReference,
    external_id:      tx.externalId,
  }))

  const { data, error } = await supabase
    .from('bank_transactions')
    .upsert(rows, { onConflict: 'user_id,external_id', ignoreDuplicates: true })
    .select('id')

  if (error) throw new Error(error.message)

  const imported = (data as { id: string }[] | null)?.length ?? 0
  const skipped  = rows.length - imported + reconciled
  return { imported, skipped }
}

/**
 * Upserts depot holdings (e.g. Union Investment "UnionDepot" positions) for a user.
 * Unlike transactions, holdings are a POINT-IN-TIME SNAPSHOT, not an append-only
 * ledger — each sync should overwrite the previous snapshot per (user, externalId)
 * rather than skip it, so `merge-duplicates` semantics are used instead of
 * `upsertBankTransactions`'s ignore-duplicates.
 */
export async function upsertDepotHoldings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  holdings: ParsedHolding[],
): Promise<{ synced: number }> {
  if (holdings.length === 0) return { synced: 0 }

  const rows = holdings.map(h => ({
    user_id:           userId,
    bank_label:        h.bankLabel,
    account_label:     h.accountLabel,
    account_number:    h.accountNumber,
    isin:              h.isin,
    name:              h.name,
    pieces:            h.pieces,
    market_value:      h.marketValue,
    currency:          h.currency,
    valuation_date:    h.valuationDate,
    total_value:       h.totalValue,
    acquisition_price: h.acquisitionPrice,
    external_id:       h.externalId,
    fetched_at:        new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('depot_holdings')
    .upsert(rows, { onConflict: 'user_id,external_id' })

  if (error) throw new Error(error.message)
  return { synced: rows.length }
}

// ── Cloud (Vercel) delegation ────────────────────────────────────────────────────
//
// The Node sidecar spawns a local Python venv (scripts/fints/.venv), which does not exist
// on Vercel. There, the interactive routes must instead delegate to the sibling Vercel
// Python Function (api/bank-sync.py) — a native Python serverless function that talks to
// the bank and upserts directly to Supabase itself, bypassing this Node layer entirely.

export interface CloudSyncResult {
  imported: number
  skipped: number
  balances: number
}

/** True when running as a Vercel Function (Vercel sets this automatically). */
export function isCloudRuntime(): boolean {
  return !!process.env.VERCEL
}

/**
 * Triggers api/bank-sync.py and relays its result. That function always syncs the single
 * configured bank account (BANK_SYNC_USER_ID) — callers should confirm the requesting user
 * matches before calling this, otherwise a different logged-in user could trigger a sync
 * whose data lands under someone else's account.
 */
export async function triggerCloudBankSync(origin: string): Promise<CloudSyncResult> {
  const res = await fetch(`${origin}/api/bank-sync`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  const body = await res.json().catch(() => ({})) as {
    ok?: boolean; imported?: number; skipped?: number; balances?: number; error?: string
  }
  if (!res.ok || body.ok === false) {
    throw new Error(body.error ?? `Cloud-Sync fehlgeschlagen (HTTP ${res.status})`)
  }
  return { imported: body.imported ?? 0, skipped: body.skipped ?? 0, balances: body.balances ?? 0 }
}
