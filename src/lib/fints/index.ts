/**
 * Server-side FinTS/HBCI service — never import in client components.
 *
 * Required env vars: FINTS_URL, FINTS_BLZ, FINTS_USERNAME, FINTS_PIN
 *
 * Optional env var: FINTS_PRODUCT_ID
 *   A product ID registered with Deutsche Kreditwirtschaft (DK/ZKA).
 *   Raiffeisenbank / VR-Bank (Atruvia/Fiducia GAD backend) REQUIRE a registered
 *   product ID — without one the bank returns 9050/9160/9800.
 *   To register for free: https://www.hbci-zka.de/register/prod_register.htm
 *   Until then, set FINTS_PRODUCT_ID to a 5-25 char alphanumeric string and
 *   contact your bank if errors persist.
 *
 * Stateful TAN flow (for serverless environments):
 *   1. startSync() → bank responds with TanRequiredError
 *   2. We serialize error.dialog (WITHOUT the PIN) + encrypt → Supabase
 *   3. User enters TAN → completeSync(transactionRef, tan)
 *   4. PIN is re-added from env at completion time
 */

import { PinTanClient, TanRequiredError } from 'node-fints'
import type { SEPAAccount, Balance, Statement } from 'node-fints'
import { encrypt, decrypt } from '@/lib/encryption'
import { categorize } from './categorize'
import { createClient } from '@/lib/supabase/server'

// ── Config ─────────────────────────────────────────────────────────────────────

// The node-fints library uses "fints" as the default product ID, but if it is
// passed as undefined it gets overwritten via Object.assign in the Dialog
// constructor. Always provide an explicit non-empty value.
const FALLBACK_PRODUCT_ID = 'fints'

function getConfig() {
  const url       = process.env.FINTS_URL?.trim()
  const blz       = process.env.FINTS_BLZ?.replace(/\D/g, '') // strip spaces/dashes → exactly 8 digits
  const name      = process.env.FINTS_USERNAME?.trim()
  const pin       = process.env.FINTS_PIN?.trim()
  const productId = process.env.FINTS_PRODUCT_ID?.trim() || FALLBACK_PRODUCT_ID

  if (!url || !blz || !name || !pin) {
    throw new Error('FinTS environment variables not configured (FINTS_URL, FINTS_BLZ, FINTS_USERNAME, FINTS_PIN)')
  }
  if (blz.length !== 8) {
    throw new Error(`FINTS_BLZ muss genau 8 Ziffern haben, hat aber ${blz.length}: "${blz}"`)
  }
  if (productId.length < 5 || productId.length > 25) {
    throw new Error(`FINTS_PRODUCT_ID muss 5–25 Zeichen haben, hat aber ${productId.length}`)
  }

  console.log('[FinTS] Config:', { url, blz, name: name.substring(0, 3) + '***', productId })
  return { url, blz, name, pin, productId }
}

function makeClient() {
  const { url, blz, name, pin, productId } = getConfig()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opts: any = { url, blz, name, pin, productId, debug: true }
  return new PinTanClient(opts)
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface FetchedBalance {
  iban: string
  bic: string
  accountName: string
  bookedBalance: number
  availableBalance: number
  currency: string
}

/**
 * Fetches account balances for all accounts.
 * Does NOT require a TAN.
 */
export async function fetchBalances(): Promise<FetchedBalance[]> {
  const client = makeClient()
  const accounts: SEPAAccount[] = await client.accounts()

  const results: FetchedBalance[] = []
  for (const account of accounts) {
    try {
      const balance: Balance = await client.balance(account)
      results.push({
        iban:             account.iban,
        bic:              account.bic,
        accountName:      account.accountName ?? account.accountNumber,
        bookedBalance:    balance.bookedBalance,
        availableBalance: balance.availableBalance,
        currency:         balance.currency,
      })
    } catch {
      // Skip accounts where balance fetch fails (e.g. depot sub-accounts)
    }
  }
  return results
}

// ── Dialog serialization for TAN persistence ──────────────────────────────────

const TAN_DIALOG_KEY = 'fints_tan_dialog'

interface SerializedDialog {
  // PinTanClient internal dialog state — everything except the PIN
  blz: string
  name: string
  systemId: string
  productId?: string
  dialogId: string
  msgNo: number
  tanMethods?: unknown[]
  hisalsVersion?: number
  hikazsVersion?: number
  // which account we were fetching
  accountIban: string
  accountBic: string
  accountNumber: string
  accountBlz: string
  // date range
  startDate?: string
  endDate?: string
}

async function persistDialog(userId: string, data: SerializedDialog): Promise<void> {
  const supabase = await createClient()
  const encrypted = encrypt(JSON.stringify(data))
  await supabase.from('user_settings').upsert(
    { user_id: userId, key: TAN_DIALOG_KEY, value: encrypted },
    { onConflict: 'user_id,key' },
  )
}

async function loadDialog(userId: string): Promise<SerializedDialog | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('user_settings')
    .select('value')
    .eq('user_id', userId)
    .eq('key', TAN_DIALOG_KEY)
    .maybeSingle()
  if (!data?.value) return null
  try {
    return JSON.parse(decrypt(data.value as string)) as SerializedDialog
  } catch {
    return null
  }
}

async function clearDialog(userId: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('user_settings').delete()
    .eq('user_id', userId).eq('key', TAN_DIALOG_KEY)
}

// ── Transaction sync ───────────────────────────────────────────────────────────

export interface TanRequiredResult {
  tanRequired: true
  transactionRef: string
  challengeText: string
  challengeMedia?: string
}

export interface SyncResult {
  transactions: ParsedTransaction[]
  accounts: SEPAAccount[]
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

function buildExternalId(iban: string, valueDate: string, amount: number, description: string): string {
  // Stable hash-like ID using base64 of concatenated key fields
  const raw = `${iban}|${valueDate}|${amount}|${description.substring(0, 100)}`
  return Buffer.from(raw).toString('base64')
}

function parseStatements(accounts: SEPAAccount[], statements: Statement[][]): ParsedTransaction[] {
  const txns: ParsedTransaction[] = []

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i]
    const stmts   = statements[i] ?? []

    for (const stmt of stmts) {
      for (const tx of stmt.transactions) {
        const signed = tx.isCredit ? tx.amount : -tx.amount
        const fullDesc = tx.description ?? ''
        const structured = tx.descriptionStructured

        const counterpartName = structured?.name ?? null
        const counterpartIban = structured?.iban ?? structured?.reference?.iban ?? null
        const counterpartBic  = structured?.bic  ?? structured?.reference?.bic  ?? null
        const descText        = structured?.reference?.text ?? fullDesc

        txns.push({
          accountIban:    account.iban,
          accountBic:     account.bic,
          amount:         signed,
          currency:       tx.currency ?? 'EUR',
          valueDate:      tx.valueDate,
          entryDate:      tx.entryDate ?? null,
          description:    descText,
          counterpartName,
          counterpartIban,
          counterpartBic,
          category:       categorize(descText) ?? categorize(fullDesc),
          rawDescription: fullDesc,
          externalId:     buildExternalId(account.iban, tx.valueDate, signed, fullDesc),
        })
      }
    }
  }
  return txns
}

/**
 * Initiates a transaction sync.
 * - If the bank requires a TAN, returns TanRequiredResult (serializes dialog to Supabase).
 * - Otherwise returns the parsed transactions.
 */
export async function startSync(
  userId: string,
  startDate?: Date,
  endDate?: Date,
): Promise<TanRequiredResult | SyncResult> {
  const client   = makeClient()
  const accounts = await client.accounts()

  const statements: Statement[][] = []

  try {
    for (const account of accounts) {
      const stmts = await client.statements(account, startDate, endDate)
      statements.push(stmts)
    }
    return {
      transactions: parseStatements(accounts, statements),
      accounts,
    }
  } catch (err) {
    if (err instanceof TanRequiredError) {
      // Serialize dialog (without PIN) and persist for later completion
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dialogState = err.dialog as unknown as Record<string, unknown>
      const serialized: SerializedDialog = {
        blz:             dialogState['blz']             as string,
        name:            dialogState['name']            as string,
        systemId:        dialogState['systemId']        as string,
        productId:       dialogState['productId']       as string | undefined,
        dialogId:        dialogState['dialogId']        as string,
        msgNo:           dialogState['msgNo']           as number,
        tanMethods:      dialogState['tanMethods']      as unknown[],
        hisalsVersion:   dialogState['hisalsVersion']   as number,
        hikazsVersion:   dialogState['hikazsVersion']   as number,
        accountIban:     accounts[0]?.iban    ?? '',
        accountBic:      accounts[0]?.bic     ?? '',
        accountNumber:   accounts[0]?.accountNumber ?? '',
        accountBlz:      accounts[0]?.blz     ?? '',
        startDate:       startDate?.toISOString(),
        endDate:         endDate?.toISOString(),
      }
      await persistDialog(userId, serialized)

      // challengeMedia may be a Buffer — convert to base64 string for JSON transport
      const media = err.challengeMedia
      return {
        tanRequired:    true,
        transactionRef: err.transactionReference,
        challengeText:  err.challengeText,
        challengeMedia: media ? (Buffer.isBuffer(media) ? media.toString('base64') : String(media)) : undefined,
      }
    }
    throw err
  }
}

/**
 * Completes a TAN-gated sync after the user has entered the TAN.
 */
export async function completeSync(
  userId: string,
  transactionRef: string,
  tan: string,
): Promise<SyncResult> {
  const saved = await loadDialog(userId)
  if (!saved) throw new Error('Keine gespeicherte FinTS-Sitzung gefunden. Bitte neu synchronisieren.')

  const { pin } = getConfig()

  // Reconstruct the dialog object that node-fints expects
  const dialog = {
    ...saved,
    pin,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = makeClient()
  const statements = await (client as any).completeStatements(dialog, transactionRef, tan)

  await clearDialog(userId)

  // For completeStatements we only had one account in the saved dialog
  const account: SEPAAccount = {
    iban:          saved.accountIban,
    bic:           saved.accountBic,
    accountNumber: saved.accountNumber,
    blz:           saved.accountBlz,
  }

  return {
    transactions: parseStatements([account], [statements]),
    accounts: [account],
  }
}
