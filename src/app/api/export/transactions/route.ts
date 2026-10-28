import type { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { resolveScope } from '@/lib/haushalt/resolve'
import { applyAccountScope } from '@/lib/haushalt/scope'
import { herabstufungsIds } from '@/lib/haushalt/umbuchung'
import { parseFilter } from '@/lib/transaktionen/filter'
import { kategorieIdsFuer, wendeFilterAn } from '@/lib/data/finance-transactions'
import { CSV_BOM, CSV_EOL, CSV_SEPARATOR, escapeCsvValue, formatCsvAmount } from '@/lib/csv'

/**
 * CSV-Export der Transaktionen, im deutschen Excel-Dialekt.
 *
 * Vorher schrieb dieser Export `-1234.56` mit Komma als Spaltentrenner — also US-Format.
 * Deutsches Excel liest den Punkt als Tausendertrennung: aus −1234.56 wird beim Öffnen
 * −123456, und weil zusätzlich das Komma die Spalten trennt, zerlegt Excel jede Zahl mit
 * Nachkommastellen noch in zwei Zellen. Beides meldet Excel nicht als Fehler, die Beträge
 * sind einfach still falsch.
 *
 * Die Konvention (Trennzeichen, Dezimalkomma, BOM, CRLF) steht in lib/csv.ts und wird vom
 * Import geteilt — genau daran waren die beiden Seiten auseinandergelaufen.
 *
 * Das Datum bleibt bewusst ISO (`2026-08-31`): das erkennt Excel unter jeder Locale als
 * Datum, und der Import-Parser versteht ohnehin beide Schreibweisen.
 */

/**
 * Filter wie auf der Transaktionen-Seite (Typ, Art, Konto, Kategorie, Zeitraum, Suche, Betrag, Sortierung):
 * der Export schreibt, was die Liste zeigt — gleiche Prüfung (`parseFilter`), gleiche Abfrage
 * (`wendeFilterAn`). Der alte Parameter `account_id` (Export-Link des Konto-Details) gilt als `account`.
 */
const PAGE = 1000

/**
 * Excel führt Zellen aus, die mit `=`, `+`, `-` oder `@` beginnen, als Formel aus. Empfängernamen und
 * Verwendungszwecke stammen von der Bank bzw. von Dritten — ein Apostroph davor macht daraus Text.
 * Nur für Textfelder, nie für den Betrag (der ist eine Zahl und soll eine bleiben).
 */
function schuetzeFormel(wert: string | null): string | null {
  return wert !== null && /^[=+\-@\t\r]/.test(wert) ? `'${wert}` : wert
}
const MAX_PAGES = 100

const CSV_HEADERS = ['datum', 'betrag', 'beschreibung', 'haendler', 'kategorie', 'konto', 'waehrung']

export async function GET(req: NextRequest) {
  const { supabase, user } = await getAuthUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const ctx = await resolveScope(supabase, user)
  const params = Object.fromEntries(req.nextUrl.searchParams.entries())
  const filter = parseFilter(params)

  // unified_transactions (see migration 20260821010000) merges in FinTS-synced bank
  // transactions for linked accounts, so an export includes those alongside manual entries.
  // Seitenweise: PostgREST kappt eine Antwort still bei 1.000 Zeilen — ein Export mit mehr
  // Buchungen war sonst stillschweigend unvollständig.
  const [feld, richtung] = filter.sort.split('-')
  const aufsteigend = richtung === 'asc'
  const kategorieIds = await kategorieIdsFuer(supabase, filter)
  const herab = herabstufungsIds(ctx)
  const transactions: {
    date: string | null
    amount: number | null
    signed_amount: number | null
    type: string | null
    description: string | null
    merchant: string | null
    currency: string | null
    account_name: string | null
    category_name: string | null
  }[] = []

  for (let seite = 0; seite < MAX_PAGES; seite++) {
    let query = wendeFilterAn(
      // Die Spalten sind unabhaengig von der Herabstufung (Betrag trägt das Vorzeichen auch bei Umbuchungen); nur der Typ-/Art-Filter
      // wirkt im Haushalt auf die effektive Art (herab), damit der Export genau die Liste schreibt.
      applyAccountScope(
        supabase
          .from('unified_transactions')
          .select('date, amount, signed_amount, type, description, merchant, currency, account_name, category_name'),
        ctx,
      ),
      filter,
      kategorieIds,
      herab,
    )
    if (feld === 'amount') query = query.order('amount', { ascending: aufsteigend }).order('date', { ascending: false })
    else query = query.order('date', { ascending: aufsteigend })
    query = query.order('id', { ascending: aufsteigend })

    const { data, error } = await query.range(seite * PAGE, seite * PAGE + PAGE - 1)
    if (error) return new Response('Error fetching transactions', { status: 500 })
    if (!data || data.length === 0) break
    transactions.push(...data)
    if (data.length < PAGE) break
  }

  const lines: string[] = [CSV_HEADERS.join(CSV_SEPARATOR)]

  for (const tx of transactions) {
    if (tx.amount == null || tx.type == null) continue

    let amount: number
    if (tx.type === 'expense') {
      amount = -Math.abs(tx.amount)
    } else if (tx.type === 'income') {
      amount = Math.abs(tx.amount)
    } else {
      // Umbuchung: das Vorzeichen der Buchung (Abgang negativ). Mit dem Betrag allein würde ein Reimport den
      // Abgang als Zugang buchen.
      amount = tx.signed_amount ?? tx.amount
    }

    const row = [
      escapeCsvValue(tx.date),
      formatCsvAmount(amount),
      escapeCsvValue(schuetzeFormel(tx.description)),
      escapeCsvValue(schuetzeFormel(tx.merchant)),
      escapeCsvValue(schuetzeFormel(tx.category_name)),
      escapeCsvValue(schuetzeFormel(tx.account_name)),
      escapeCsvValue(tx.currency),
    ]
    lines.push(row.join(CSV_SEPARATOR))
  }

  const csv = CSV_BOM + lines.join(CSV_EOL) + CSV_EOL

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="transaktionen.csv"',
    },
  })
}
