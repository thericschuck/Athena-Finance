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

import { suggestCategory, buildLearnedCategoryMap, normalizeCounterpart, type LearnedCategoryMap } from './categorize'
import {
  runSidecar,
  type SidecarAccount, type SidecarTransaction, type SidecarHolding, type SidecarBalance,
  type BankClientStateMap,
} from './sidecar'
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
  /**
   * Current balance per account as the bank reported it. This is the only trustworthy
   * balance figure: FinTS hands out a limited window of transactions, so summing them
   * yields a period delta, not a balance. It is also the ONLY thing FinTS returns for a
   * Bausparvertrag — those come through the Verbund login as a plain Spar-/Darlehenskonto
   * (HKSAL), never as a Wertpapierdepot, so a balance is all there is to fetch.
   */
  balances: FetchedBalance[]
  /** One message per configured bank that failed this sync (others still succeed). */
  warnings: string[]
  /**
   * Client state to persist via saveBankClientState(). Carries the Kundensystem-ID —
   * storing it is what keeps the next sync from triggering another app approval.
   */
  state?: BankClientStateMap
  /** Bank labels that aborted because an app approval was needed but not allowed (noSca). */
  scaRequired: string[]
}

export interface StartSyncOptions {
  /** Previously persisted client state (loadBankClientState()). Omit on a first sync. */
  state?: BankClientStateMap
  /**
   * Unattended run: don't wait for a SecureGo plus approval. The sidecar aborts with
   * 'sca_required' instead of blocking for minutes on an approval nobody will give.
   */
  noSca?: boolean
}

/**
 * Rolling window that stays inside PSD2's exemption for account information: with a valid
 * persisted client state, transactions from the last 90 days are retrievable without a fresh
 * app approval. Anything older is SCA-bound regardless of stored state, which is why the
 * full-history sync is a separate, explicitly requested action.
 */
export const SCA_FREE_LOOKBACK_DAYS = 90

/** Start date for a routine sync — SCA_FREE_LOOKBACK_DAYS back from today. */
export function scaFreeStartDate(): Date {
  const d = new Date()
  d.setDate(d.getDate() - SCA_FREE_LOOKBACK_DAYS)
  return d
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
  options: StartSyncOptions = {},
): Promise<SyncResult> {
  // balances: true is what makes HKSAL run. Without it the sidecar only ever issues
  // HKKAZ/HKWPD, which is why bank_balance never refreshed from this route and why the
  // probed Bausparverträge produced nothing — the one segment they answer was never sent.
  const result = await runSidecar({
    startDate, endDate,
    balances: true,
    state: options.state,
    noSca: options.noSca,
  })

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
    balances:     mapBalances(result.balances, result.accounts),
    warnings:     result.warnings ?? [],
    state:        result.state,
    scaRequired:  result.scaRequired ?? [],
  }
}

/**
 * Narrows sidecar balances to the ones that can actually be stored. bank_balance is keyed by
 * (user_id, account_iban), so an entry needs *some* stable account identifier — a real IBAN
 * for the Girokonten, or the bare Kontonummer the probe path reports for a Bausparvertrag
 * (the column is plain text; the fn_ensure_linked_account trigger matches it against the
 * accounts row's free-text `iban` the same way either fits).
 */
function mapBalances(balances: SidecarBalance[], accounts: SidecarAccount[]): FetchedBalance[] {
  return balances
    .filter(b => b.iban && b.bookedBalance != null)
    .map(b => {
      const account = accounts.find(a => a.iban === b.iban)
      return {
        bankLabel:        b.bankLabel ?? null,
        iban:             b.iban!,
        bic:              b.bic ?? '',
        accountName:      b.accountName ?? account?.accountName ?? account?.accountNumber ?? b.iban!,
        bookedBalance:    b.bookedBalance!,
        availableBalance: b.availableBalance ?? b.bookedBalance!,
        currency:         b.currency || 'EUR',
      }
    })
}

/**
 * Upserts the bank-reported balances. Writing these is what keeps every downstream balance
 * honest — the fn_ensure_linked_account trigger on bank_balance mirrors each one into
 * account_balances for today, and the daily snapshot anchors its history on them.
 */
export async function upsertBankBalances(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  balances: FetchedBalance[],
): Promise<{ synced: number }> {
  if (balances.length === 0) return { synced: 0 }

  const rows = balances.map(b => ({
    user_id:           userId,
    bank_label:        b.bankLabel,
    account_iban:      b.iban,
    account_bic:       b.bic || null,
    account_name:      b.accountName,
    booked_balance:    b.bookedBalance,
    available_balance: b.availableBalance,
    currency:          b.currency,
    fetched_at:        new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('bank_balance')
    .upsert(rows, { onConflict: 'user_id,account_iban' })

  if (error) throw new Error(error.message)
  return { synced: rows.length }
}

/**
 * True if this error is the sidecar refusing to wait for an app approval (--no-sca).
 * Callers use it to surface "bitte einmal manuell synchronisieren" instead of a bank error.
 */
export function isScaRequiredError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'sca_required'
}

/** The client state a failed sidecar run still managed to produce, if any. */
export function stateFromError(err: unknown): BankClientStateMap | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  return (err as { state?: BankClientStateMap }).state
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
  // instead, or — when the posting is already stored under its reference-based id — delete
  // the leftover legacy copy.
  //
  // Matching happens on (iban, date, amount) PLUS the purpose text, and only falls back to
  // (iban, date, amount) alone when that is already unambiguous. Amount+date on its own is
  // not selective enough in practice: two same-day card payments of the identical amount
  // (observed: an ANTHROPIC and a VERCEL charge, both -21.61 on the same day) made the match
  // ambiguous, so BOTH legacy rows were left in place as permanent duplicates — and because
  // a balance series is reconstructed by subtracting the ledger from the current balance,
  // each stray row shifts the ENTIRE history. Six such rows put the Girokonto's derived
  // opening balance at -269.66 EUR instead of +287.12 EUR.
  const { data: existingRows, error: legacyErr } = await supabase
    .from('bank_transactions')
    .select('id, account_iban, value_date, amount, external_id, bank_reference, description, raw_description')
    .eq('user_id', userId)

  if (legacyErr) throw new Error(legacyErr.message)

  type ExistingRow = {
    id: string; account_iban: string; value_date: string; amount: number
    external_id: string | null; bank_reference: string | null
    description: string | null; raw_description: string | null
  }
  const existing = (existingRows ?? []) as ExistingRow[]

  // Every external_id already in the table. The reconcile UPDATE below writes into a UNIQUE
  // (user_id, external_id) index, so without this set it can collide with a row that already
  // holds the incoming id — which is exactly what aborted the whole sync with
  // "duplicate key value violates unique constraint bank_transactions_external_id_idx".
  const takenExternalIds = new Set(existing.map(r => r.external_id).filter(Boolean) as string[])

  // The bank rewrites the purpose text between fetches (it appends "SecureGo plus IBAN: ..."
  // to transfers), so the two sides of a match are compared on a normalised prefix rather
  // than on equality: case-folded, whitespace-collapsed, and cut to the length both sides
  // are known to share.
  const DESC_MATCH_LEN = 30
  const descKey = (text: string | null | undefined) =>
    (text ?? '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, DESC_MATCH_LEN)

  const coarseKey = (iban: string, date: string, amount: number) => `${iban}|${date}|${amount}`

  const legacyByCoarse = new Map<string, string[]>()
  const legacyByFine   = new Map<string, string[]>()
  const push = (map: Map<string, string[]>, key: string, id: string) => {
    const ids = map.get(key)
    if (ids) ids.push(id)
    else map.set(key, [id])
  }
  for (const row of existing) {
    if (row.bank_reference !== null) continue
    const coarse = coarseKey(row.account_iban, row.value_date, row.amount)
    push(legacyByCoarse, coarse, row.id)
    push(legacyByFine, `${coarse}|${descKey(row.description ?? row.raw_description)}`, row.id)
  }

  const consumed = new Set<string>()
  const available = (ids: string[] | undefined) => (ids ?? []).filter(id => !consumed.has(id))

  const toInsert: ParsedTransaction[] = []
  let reconciled = 0
  let deduped    = 0

  for (const tx of transactions) {
    if (!tx.bankReference) { toInsert.push(tx); continue }

    const coarse = coarseKey(tx.accountIban, tx.valueDate, tx.amount)
    const fine   = `${coarse}|${descKey(tx.description ?? tx.rawDescription)}`

    // Purpose text first — it is what tells two same-day, same-amount postings apart.
    let candidates = available(legacyByFine.get(fine))
    if (candidates.length !== 1) candidates = available(legacyByCoarse.get(coarse))

    if (candidates.length !== 1) { toInsert.push(tx); continue }
    const legacyId = candidates[0]
    consumed.add(legacyId) // spoken for; never match a second transaction to it

    if (takenExternalIds.has(tx.externalId)) {
      // This posting is ALREADY stored under its bank_reference-based id, and the legacy
      // row is the second, purpose-hashed copy of that very same posting — the situation
      // the reconcile is meant to heal. Stamping the (taken) id onto the legacy row would
      // violate the unique index; the legacy row is the redundant one, so drop it.
      const { error } = await supabase
        .from('bank_transactions')
        .delete()
        .eq('id', legacyId)
      if (error) throw new Error(error.message)
      deduped++
    } else {
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
        .eq('id', legacyId)
      if (error) throw new Error(error.message)
      takenExternalIds.add(tx.externalId)
      reconciled++
    }
  }

  if (toInsert.length === 0) return { imported: 0, skipped: reconciled + deduped }

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
  const skipped  = rows.length - imported + reconciled + deduped
  return { imported, skipped }
}

/**
 * Sweeps existing bank_transactions with no category and fills in ONLY the ones where the
 * counterparty is unambiguously learned from the user's own categorization history — never a
 * keyword-rule guess. A learned match re-applies a choice the user already made for this exact
 * counterparty, so it writes directly; a keyword-only suggestion still needs a human decision
 * in the review panel (getSuggestCategories), because it is a guess, not a repetition.
 *
 * Called after every sync so the backlog shrinks on its own instead of piling up in the
 * suggestions panel — see docs/athenas-takt.html.
 */
export async function applyLearnedCategoriesToBacklog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<{ applied: number }> {
  const { data: categorized } = await supabase
    .from('bank_transactions')
    .select('counterpart_name, category_id')
    .eq('user_id', userId)
    .not('category_id', 'is', null)

  const learnedMap = buildLearnedCategoryMap(categorized ?? [])
  if (learnedMap.size === 0) return { applied: 0 }

  const { data: uncategorized } = await supabase
    .from('bank_transactions')
    .select('id, counterpart_name')
    .eq('user_id', userId)
    .is('category_id', null)
    .not('counterpart_name', 'is', null)

  const idsByCategory = new Map<string, string[]>()
  for (const tx of (uncategorized ?? []) as { id: string; counterpart_name: string }[]) {
    const categoryId = learnedMap.get(normalizeCounterpart(tx.counterpart_name))
    if (!categoryId) continue
    const ids = idsByCategory.get(categoryId) ?? []
    ids.push(tx.id)
    idsByCategory.set(categoryId, ids)
  }

  let applied = 0
  for (const [categoryId, ids] of idsByCategory) {
    const { error } = await supabase
      .from('bank_transactions')
      .update({ category_id: categoryId })
      .in('id', ids)
    if (!error) applied += ids.length
  }
  return { applied }
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
  /** The cloud function stopped because the bank wants an app approval (90-day window over). */
  scaRequired?: boolean
  /** Human-readable explanation when scaRequired is set. */
  message?: string
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
 *
 * `allowSca` must be true for a user-initiated sync: only then is somebody around to
 * approve in the SecureGo plus app. The cron path calls the function directly without it,
 * so it aborts instead of blocking on an approval nobody will give.
 */
export async function triggerCloudBankSync(
  origin: string,
  opts: { allowSca?: boolean; fullHistory?: boolean } = {},
): Promise<CloudSyncResult> {
  const url = new URL(`${origin}/api/bank-sync`)
  if (opts.allowSca)    url.searchParams.set('sca',  '1')
  if (opts.fullHistory) url.searchParams.set('full', '1')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  const body = await res.json().catch(() => ({})) as {
    ok?: boolean; imported?: number; skipped?: number; balances?: number
    error?: string; skippedReason?: string; message?: string
  }
  if (!res.ok || body.ok === false) {
    throw new Error(body.error ?? `Cloud-Sync fehlgeschlagen (HTTP ${res.status})`)
  }
  return {
    imported: body.imported ?? 0,
    skipped: body.skipped ?? 0,
    balances: body.balances ?? 0,
    scaRequired: body.skippedReason === 'sca_required',
    message: body.message,
  }
}
