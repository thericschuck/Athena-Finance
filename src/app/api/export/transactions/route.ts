import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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

const CSV_HEADERS = ['datum', 'betrag', 'beschreibung', 'haendler', 'kategorie', 'konto', 'waehrung']

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const accountId = searchParams.get('account_id')

  // unified_transactions (see migration 20260821010000) merges in FinTS-synced bank
  // transactions for linked accounts, so an export includes those alongside manual entries.
  let query = supabase
    .from('unified_transactions')
    .select('date, amount, type, description, merchant, currency, account_name, category_name')
    .eq('user_id', user.id)
    .order('date', { ascending: false })

  if (accountId) {
    query = query.eq('account_id', accountId)
  }

  const { data: transactions, error } = await query

  if (error) {
    return new Response('Error fetching transactions', { status: 500 })
  }

  const lines: string[] = [CSV_HEADERS.join(CSV_SEPARATOR)]

  for (const tx of transactions ?? []) {
    if (tx.amount == null || tx.type == null) continue

    let amount: number
    if (tx.type === 'expense') {
      amount = -Math.abs(tx.amount)
    } else if (tx.type === 'income') {
      amount = Math.abs(tx.amount)
    } else {
      amount = tx.amount
    }

    const row = [
      escapeCsvValue(tx.date),
      formatCsvAmount(amount),
      escapeCsvValue(tx.description),
      escapeCsvValue(tx.merchant),
      escapeCsvValue(tx.category_name),
      escapeCsvValue(tx.account_name),
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
