import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/api/auth'
import { parseQuery } from '@/lib/api/validate'
import { getAllMonthlyTotals } from '@/lib/data/verlauf-monate'
import { sparquote } from '@/lib/verlauf/monate'
import { CSV_BOM, CSV_EOL, CSV_SEPARATOR, escapeCsvValue, formatCsvAmount } from '@/lib/csv'

/**
 * CSV-Export der Monatsübersicht, im deutschen Excel-Dialekt (Trennzeichen `;`, Dezimalkomma,
 * BOM, CRLF — die Konvention steht in lib/csv.ts, siehe api/export/transactions).
 *
 * Es sind die Rohwerte je Monat, ohne Jahreszwischenzeilen: eine Tabelle mit Summenzeilen
 * mitten in den Daten lässt sich in Excel nicht sauber filtern oder in eine Pivot ziehen.
 * Aufsteigend sortiert, weil Tabellenkalkulationen chronologisch weiterrechnen.
 *
 * Gelesen wird mit der Session des Nutzers über `user_id`-Filter (RLS gilt zusätzlich), es
 * gibt also nur eigene Daten. Optional `?jahr=2026` schränkt auf ein Jahr ein.
 */

const querySchema = z.object({
  jahr: z.preprocess(v => (v === '' ? undefined : v), z.string().regex(/^\d{4}$/, 'Jahr als vierstellige Zahl').optional()),
})

const CSV_HEADERS = [
  'monat', 'einnahmen', 'ausgaben', 'saldo', 'konsum_einnahmen', 'konsum_ausgaben', 'sparquote_prozent',
  'anlage_ausgaben', 'anlage_einnahmen', 'forderung_ausgaben', 'forderung_einnahmen', 'buchungen',
]

export async function GET(req: NextRequest) {
  const auth = await requireUser()
  if (auth.response) return auth.response
  const { user, supabase } = auth

  const q = parseQuery(req, querySchema)
  if (q.response) return q.response
  const jahr = q.data.jahr

  let rows
  try {
    rows = await getAllMonthlyTotals(supabase, user.id)
  } catch {
    return new Response('Error fetching monthly totals', { status: 500 })
  }

  const lines: string[] = [CSV_HEADERS.join(CSV_SEPARATOR)]
  const sorted = rows
    .filter(r => !jahr || r.month.startsWith(jahr))
    .sort((a, b) => a.month.localeCompare(b.month))

  for (const r of sorted) {
    const rate = sparquote(r)
    lines.push([
      escapeCsvValue(r.month.slice(0, 7)),
      formatCsvAmount(r.income),
      formatCsvAmount(r.expense),
      formatCsvAmount(r.income - r.expense),
      formatCsvAmount(r.echt_income),
      formatCsvAmount(r.echt_expense),
      // Leer statt „0", wenn es keine Konsum-Einnahmen gab: die Quote ist dann nicht definiert.
      rate === null ? '' : String(rate),
      formatCsvAmount(r.anlage_expense),
      formatCsvAmount(r.anlage_income),
      formatCsvAmount(r.forderung_expense),
      formatCsvAmount(r.forderung_income),
      String(r.tx_count),
    ].join(CSV_SEPARATOR))
  }

  return new Response(CSV_BOM + lines.join(CSV_EOL) + CSV_EOL, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="monatsuebersicht${jahr ? `-${jahr}` : ''}.csv"`,
    },
  })
}
