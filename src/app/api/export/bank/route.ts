import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/supabase/server'
import { resolveScope } from '@/lib/haushalt/resolve'
import { parseQuery } from '@/lib/api/validate'
import { CSV_BOM, CSV_EOL, CSV_SEPARATOR, escapeCsvValue, formatCsvAmount } from '@/lib/csv'
import { LEERER_FILTER, filterBuchungen, ibanMenge, kategorieMitKindern, parseBetrag, sortiereBuchungen } from '@/lib/bank/buchungen'
import { normIban } from '@/lib/bank/scope'
import type { BankTransaction } from '@/types/bank'

/**
 * CSV-Export der Bankbuchungen (Bankdaten-Seite), im selben deutschen Excel-Dialekt wie
 * api/export/transactions (lib/csv.ts: `;`, Dezimalkomma, BOM, CRLF).
 *
 * Filter wie die Liste: konto, von, bis, q — dazu kat, partei, typ, min, max, damit
 * "Exportieren" exakt das ausgibt, was gerade auf dem Bildschirm steht. Gefiltert wird mit
 * derselben Funktion wie im Browser (lib/bank/buchungen.ts).
 */

const optional = z.string().optional().transform(v => v ?? '')
const datum = z.string().optional().transform(v => v ?? '').refine(v => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Datum erwartet als YYYY-MM-DD')

const querySchema = z.object({
  konto: optional,
  von: datum,
  bis: datum,
  q: optional,
  kat: optional,
  partei: optional,
  typ: z.enum(['alle', 'eingang', 'ausgang', 'umbuchung']).optional().default('alle'),
  min: optional,
  max: optional,
})

const CSV_HEADERS = [
  'wertstellung', 'buchungsdatum', 'betrag', 'waehrung', 'gegenpartei', 'gegen_iban',
  'verwendungszweck', 'kategorie', 'konto',
]

/**
 * CSV-Injection: Excel wertet Zellen, die mit = + - @ (oder Tab/CR) beginnen, als Formel aus.
 * Verwendungszweck und Gegenpartei kommen von Dritten (jeder kann dir eine Ueberweisung mit
 * `=HYPERLINK(...)` als Zweck schicken). Ein vorangestelltes Apostroph macht die Zelle zu
 * Text. lib/csv maskiert nur Trennzeichen/Anfuehrungszeichen, deshalb hier — und NUR fuer
 * Textspalten: der Betrag (`-12,50`) ist legitim negativ und kommt nicht hier durch.
 */
function textZelle(value: string | null | undefined): string {
  if (value == null) return ''
  const s = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return escapeCsvValue(s)
}

const PAGE = 1000

export async function GET(req: NextRequest) {
  const { supabase, user } = await getAuthUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const ctx = await resolveScope(supabase, user)
  const q = parseQuery(req, querySchema)
  if (q.response) return q.response
  const p = q.data

  // PostgREST kappt Antworten bei 1.000 Zeilen — daher seitenweise holen. Das Konto wird
  // lokal ueber die normalisierte IBAN gefiltert: in der DB steht sie nicht zwingend ohne
  // Leerzeichen, ein Gleichheitsfilter wuerde dann still nichts finden.
  const alle: BankTransaction[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('*')
      // Konten im Scope (bank_transactions hat keine account_id: ueber die IBAN).
      .in('account_iban', ctx.ibans)
      .order('value_date', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return new Response('Error fetching transactions', { status: 500 })
    alle.push(...((data ?? []) as BankTransaction[]))
    if (!data || data.length < PAGE) break
  }
  const basis = p.konto ? alle.filter(t => normIban(t.account_iban) === normIban(p.konto)) : alle

  // Kategorienbaum pro Haushalt (RLS); Umbuchungsmenge = Konten im Scope.
  const { data: kats } = await supabase.from('categories').select('id, name, parent_id')
  const katName = new Map((kats ?? []).map(k => [k.id as string, k.name as string]))
  const eigene = ibanMenge(ctx.ibans)

  const treffer = sortiereBuchungen(
    filterBuchungen(basis, {
      ...LEERER_FILTER,
      q: p.q, kategorie: p.kat, partei: p.partei,
      // Wie in der Liste: eine Hauptkategorie nimmt ihre Unterkategorien mit.
      kategorieMenge: p.kat && p.kat !== 'offen'
        ? kategorieMitKindern(p.kat, (kats ?? []) as { id: string; parent_id: string | null }[])
        : undefined, typ: p.typ, von: p.von, bis: p.bis,
      min: parseBetrag(p.min), max: parseBetrag(p.max),
    }, eigene),
    { feld: 'datum', richtung: 'ab' },
  )

  const lines: string[] = [CSV_HEADERS.join(CSV_SEPARATOR)]
  for (const t of treffer) {
    lines.push([
      escapeCsvValue(t.value_date.slice(0, 10)),
      escapeCsvValue(t.entry_date?.slice(0, 10) ?? null),
      formatCsvAmount(t.amount),
      escapeCsvValue(t.currency),
      textZelle(t.counterpart_name),
      textZelle(t.counterpart_iban),
      textZelle(t.description ?? t.raw_description),
      textZelle(t.category_id ? katName.get(t.category_id) ?? null : null),
      textZelle(t.account_iban),
    ].join(CSV_SEPARATOR))
  }

  return new Response(CSV_BOM + lines.join(CSV_EOL) + CSV_EOL, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="bankbuchungen.csv"',
    },
  })
}
