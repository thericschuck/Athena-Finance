'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseForm, parseInput, issueMessage } from '@/lib/api/validate'
import { idField, uuid, optUuid, optText, reqDate, currency as currencySchema, boolTrue } from '@/lib/api/schemas'
import { betragAusEingabe, MAX_BETRAG, typUndBetrag } from '@/lib/transaktionen/formular'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Betrag als Text mit Vorzeichen (negativ = Ausgabe). Dieselbe Leseregel wie im Formular
// (`betragAusEingabe`): vorher las die Anlage nur Maschinenformat ("12,5" scheiterte), das Bearbeiten
// dagegen auch das Komma -- zwei Regeln für dasselbe Feld.
const betragText = z.string({ error: 'Betrag ist ungültig' }).trim().min(1, 'Betrag ist ungültig')

const createTransactionSchema = z.object({
  date: reqDate(),
  account_id: z.string({ error: 'Konto ist erforderlich' }).min(1, 'Konto ist erforderlich').pipe(uuid),
  amount: betragText,
  currency: currencySchema,
  is_transfer: boolTrue,
  transfer_to: optUuid(),
  category_id: optUuid(),
  description: optText(500),
  merchant: optText(200),
})

const updateTransactionSchema = createTransactionSchema.extend({ id: idField() })

export type TransactionActionState = { error: string } | { success: true; id?: string } | null

type Db = SupabaseClient<Database>

/** Gemeinsame Prüfung für Anlegen und Ändern: Betrag lesen, Umbuchung plausibilisieren, Besitz prüfen. */
async function pruefeEingabe(
  supabase: Db,
  userId: string,
  d: {
    amount: string
    is_transfer: boolean
    account_id: string
    transfer_to: string | null
    category_id: string | null
  },
): Promise<{ error: string } | { type: 'income' | 'expense' | 'transfer'; amount: number; transferTo: string | null }> {
  const wert = betragAusEingabe(d.amount)
  if (wert === null || Math.abs(wert) > MAX_BETRAG) return { error: 'Betrag ist ungültig' }
  if (wert === 0) return { error: 'Der Betrag darf nicht 0 sein' }
  if (d.is_transfer) {
    if (!d.transfer_to) return { error: 'Zielkonto ist erforderlich' }
    if (d.transfer_to === d.account_id) return { error: 'Quell- und Zielkonto müssen verschieden sein' }
  }
  const transferTo = d.is_transfer ? d.transfer_to : null

  // Konten und Kategorie müssen dem Nutzer gehören (sonst ließe sich eine fremde ID eintragen).
  const kontoIds = [d.account_id, ...(transferTo ? [transferTo] : [])]
  const { data: konten, error: kontoFehler } = await supabase
    .from('accounts').select('id').in('id', kontoIds).eq('user_id', userId)
  if (kontoFehler) return { error: kontoFehler.message }
  if ((konten?.length ?? 0) !== kontoIds.length) return { error: 'Konto nicht gefunden' }
  if (d.category_id) {
    const { data: kat, error: katFehler } = await supabase
      .from('categories').select('id').eq('id', d.category_id).eq('user_id', userId).maybeSingle()
    if (katFehler) return { error: katFehler.message }
    if (!kat) return { error: 'Kategorie nicht gefunden' }
  }

  const { type, amount } = typUndBetrag(wert, d.is_transfer)
  return { type, amount, transferTo }
}

/** Alle Ansichten, die Buchungen zeigen oder aufsummieren. */
function revalidiereBuchungen() {
  revalidatePath('/finance/transactions')
  revalidatePath('/finance/accounts')
  revalidatePath('/finance/accounts/[id]', 'page')
  revalidatePath('/analyse')
  revalidatePath('/dashboard')
}

export async function createTransaction(
  _prev: TransactionActionState,
  formData: FormData
): Promise<TransactionActionState> {
  const { supabase, user } = await getAuthUser()

  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, createTransactionSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const { date, account_id, currency, description, merchant, category_id } = parsed.data

  const geprueft = await pruefeEingabe(supabase, user.id, parsed.data)
  if ('error' in geprueft) return { error: geprueft.error }
  const { type, amount, transferTo } = geprueft

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      date,
      type,
      account_id,
      currency,
      amount,
      transfer_to: transferTo,
      category_id,
      description,
      merchant,
      user_id: user.id,
      // Nirgends ausgewertet (nur hier geschrieben); Spalte ist NOT NULL, deshalb 1.
      fx_rate: 1,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidiereBuchungen()
  // Die ID geht an den Aufrufer zurueck, damit z.B. der Schulden-Vorschlag (DebtSuggestion)
  // die frisch gespeicherte Buchung verknuepfen kann -- vor dem Speichern existiert noch
  // keine ID, auf die eine Zahlung zeigen koennte.
  return { success: true, id: data?.id }
}

export async function updateTransaction(
  _prev: TransactionActionState,
  formData: FormData
): Promise<TransactionActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const parsed = parseForm(formData, updateTransactionSchema)
  if (!parsed.ok) return { error: issueMessage(parsed) }
  const { id, date, account_id, currency, category_id, description, merchant } = parsed.data

  const geprueft = await pruefeEingabe(supabase, user.id, parsed.data)
  if ('error' in geprueft) return { error: geprueft.error }
  const { type, amount, transferTo } = geprueft

  const { data: geaendert, error } = await supabase
    .from('transactions')
    .update({
      date,
      type,
      account_id,
      currency,
      amount,
      transfer_to: transferTo,
      category_id,
      description,
      merchant,
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')

  if (error) return { error: error.message }
  // Ohne Treffer (z. B. inzwischen gelöscht) nicht „gespeichert“ melden.
  if (!geaendert || geaendert.length === 0) return { error: 'Buchung nicht gefunden' }

  revalidiereBuchungen()
  return { success: true }
}

// Lean, single-column update for the inline category Select in the transactions table — the
// full `updateTransaction` action needs every field (date/account/amount/...), which is
// pointless round-trip weight for a change that's visually just "pick a category". `source`
// picks the right underlying table: bank-synced rows in the unified view are really
// `bank_transactions` rows (see the `unified_transactions` view, migration 20260821010000),
// not `transactions`.
const updateCategoryArgs = z.object({
  id: uuid,
  categoryId: uuid.nullable(),
  source: z.enum(['manual', 'bank_sync']),
})

export async function updateTransactionCategory(
  id: string,
  categoryId: string | null,
  source: 'manual' | 'bank_sync',
): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const p = parseInput(updateCategoryArgs, { id, categoryId, source })
  if (!p.ok) return { error: issueMessage(p) }

  // Die Kategorie muss dem Nutzer gehören (sonst ließe sich eine fremde ID eintragen, und die View würde ihren
  // Namen mit ausliefern) — dieselbe Prüfung wie in `bulkSetzeKategorie`.
  if (categoryId) {
    const { data: kat } = await supabase
      .from('categories')
      .select('id')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!kat) return { error: 'Kategorie nicht gefunden' }
  }

  // Bei Bankbuchungen ist das eine Entscheidung des Nutzers: `category_source = 'manual'`. Nur so lernt das System
  // daraus (Regel- und KI-Treffer zählen nicht) und erkennt eine Korrektur eines KI-Vorschlags.
  const query = source === 'bank_sync'
    ? supabase.from('bank_transactions').update({ category_id: categoryId, category_source: categoryId ? 'manual' : null })
    : supabase.from('transactions').update({ category_id: categoryId })
  const { error } = await query
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  // Beide Seiten neu rendern: dieselbe Select steckt auch in der Buchungstabelle der
  // Kontodetailseite. Ohne den zweiten Aufruf zeigte die dort nach einer Änderung auf
  // /finance/transactions noch die alte Kategorie — samt der daraus gerechneten
  // „Größte Ausgaben nach Kategorie".
  revalidiereBuchungen()
  return {}
}

export async function deleteTransaction(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const p = parseInput(uuid, id)
  if (!p.ok) return { error: issueMessage(p) }

  const { data, error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'Buchung nicht gefunden (evtl. schon gelöscht)' }
  revalidiereBuchungen()
  return {}
}

// ─── Sammelaktionen ───────────────────────────────────────────────────────────
// Auswahl mehrerer Zeilen der Liste. Obergrenze je Aufruf: die Auswahl kommt aus dem Browser, und ein
// Aufruf mit zehntausend IDs wäre ein Werkzeug, die Datenbank zu beschäftigen.

const BULK_MAX = 200

const bulkZeile = z.object({ id: uuid, source: z.enum(['manual', 'bank_sync']) })
const bulkKategorieArgs = z.object({
  zeilen: z.array(bulkZeile).min(1, 'Nichts ausgewählt').max(BULK_MAX, `Höchstens ${BULK_MAX} Buchungen auf einmal`),
  categoryId: uuid.nullable(),
})

/**
 * Setzt die Kategorie für mehrere Buchungen. Wie `updateTransactionCategory`: bei Bankbuchungen ist es
 * eine Entscheidung des Nutzers (`category_source = 'manual'` — nur so lernt das System daraus), und die
 * Zeile gehört in die Tabelle ihrer Herkunft (`bank_transactions` bzw. `transactions`).
 */
export async function bulkSetzeKategorie(
  zeilen: { id: string; source: 'manual' | 'bank_sync' }[],
  categoryId: string | null,
): Promise<{ error?: string; geaendert?: number }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const p = parseInput(bulkKategorieArgs, { zeilen, categoryId })
  if (!p.ok) return { error: issueMessage(p) }

  // Die Kategorie muss dem Nutzer gehören (sonst ließe sich eine fremde ID eintragen).
  if (p.data.categoryId) {
    const { data: kat } = await supabase
      .from('categories')
      .select('id')
      .eq('id', p.data.categoryId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!kat) return { error: 'Kategorie nicht gefunden' }
  }

  const bank = p.data.zeilen.filter((z) => z.source === 'bank_sync').map((z) => z.id)
  const manuell = p.data.zeilen.filter((z) => z.source === 'manual').map((z) => z.id)

  let geaendert = 0
  if (bank.length > 0) {
    const { data, error } = await supabase
      .from('bank_transactions')
      .update({ category_id: p.data.categoryId, category_source: p.data.categoryId ? 'manual' : null })
      .in('id', bank)
      .eq('user_id', user.id)
      .select('id')
    if (error) return { error: error.message }
    geaendert += data?.length ?? 0
  }
  if (manuell.length > 0) {
    const { data, error } = await supabase
      .from('transactions')
      .update({ category_id: p.data.categoryId })
      .in('id', manuell)
      .eq('user_id', user.id)
      .select('id')
    if (error) return { error: error.message }
    geaendert += data?.length ?? 0
  }

  revalidatePath('/finance/transactions')
  revalidatePath('/finance/accounts/[id]', 'page')
  revalidatePath('/analyse')
  revalidatePath('/dashboard')
  return { geaendert }
}

const bulkLoescheArgs = z.object({
  ids: z.array(uuid).min(1, 'Nichts ausgewählt').max(BULK_MAX, `Höchstens ${BULK_MAX} Buchungen auf einmal`),
})

/**
 * Löscht mehrere MANUELLE Buchungen. Bankbuchungen lassen sich nicht löschen (die Bank ist die Quelle
 * der Wahrheit, der nächste Sync brächte sie zurück) — sie stehen gar nicht in `transactions`, werden
 * hier also schlicht nicht getroffen. `geloescht` sagt, wie viele es tatsächlich waren.
 */
export async function bulkLoesche(ids: string[]): Promise<{ error?: string; geloescht?: number }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const p = parseInput(bulkLoescheArgs, { ids })
  if (!p.ok) return { error: issueMessage(p) }

  const { data, error } = await supabase
    .from('transactions')
    .delete()
    .in('id', p.data.ids)
    .eq('user_id', user.id)
    .select('id')
  if (error) return { error: error.message }

  revalidatePath('/finance/transactions')
  revalidatePath('/finance/accounts/[id]', 'page')
  revalidatePath('/analyse')
  revalidatePath('/dashboard')
  return { geloescht: data?.length ?? 0 }
}
