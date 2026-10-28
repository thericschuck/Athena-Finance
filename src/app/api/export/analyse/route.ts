import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import { parseQuery } from '@/lib/api/validate'
import { CSV_BOM, CSV_EOL, CSV_SEPARATOR, escapeCsvValue, formatCsvAmount } from '@/lib/csv'
import { getFlowTransactionsScope } from '@/lib/data/flows-scope'
import { resolveScope } from '@/lib/haushalt/resolve'
import { getActiveAccountOptions } from '@/lib/data/overview'
import { FLOW_DEFAULT_KEY, flowDefaultFrom, includeFromParam } from '@/lib/finance/flow-calc'
import { kategorieMitKindern, parseBetrag } from '@/lib/bank/buchungen'
import {
  ART_LABEL, LEERER_FILTER, QUELLE_LABEL, STEUERROLLE_LABEL,
  filterBuchungen, sortiereBuchungen, vorzeichen,
} from '@/lib/analyse/buchungen'
import { parteiVon } from '@/lib/analyse/gegenparteien'

/**
 * CSV-Export der Analyse-Buchungsliste, im selben deutschen Excel-Dialekt wie die anderen
 * Exporte (lib/csv.ts: `;`, Dezimalkomma, BOM, CRLF).
 *
 * Die Grundmenge ist dieselbe wie auf der Seite: `von` (Beginn des Zeitraums), `accounts` und
 * `anlage` entsprechen den URL-Parametern der Analyse. Dazu kommen die Drill-down-Filter (kat,
 * monat, tag, partei) und die lokalen der Liste (q, typ, art, min, max, konto). Gefiltert wird
 * mit derselben Funktion wie im Browser (lib/analyse/buchungen.ts) — "Exportieren" liefert damit
 * genau das, was gerade auf dem Bildschirm steht. Betraege tragen ein Vorzeichen (Ausgabe negativ),
 * damit sich die Spalte in Excel direkt summieren laesst.
 */

const optional = z.string().optional().transform(v => v ?? '')
const datum = z.string().optional().transform(v => v ?? '').refine(v => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Datum erwartet als YYYY-MM-DD')
const monat = z.string().optional().transform(v => v ?? '').refine(v => v === '' || /^\d{4}-(0[1-9]|1[0-2])$/.test(v), 'Monat erwartet als YYYY-MM')

const querySchema = z.object({
  von: datum,
  accounts: optional,
  anlage: z.enum(['0', '1']).optional(),
  kat: optional,
  monat,
  tag: datum,
  partei: optional,
  q: optional,
  typ: z.enum(['alle', 'einnahmen', 'ausgaben']).optional().default('alle'),
  art: z.enum(['alle', 'echt', 'anlage', 'forderung']).optional().default('alle'),
  min: optional,
  max: optional,
  konto: optional,
})

const CSV_HEADERS = [
  'datum', 'art', 'betrag', 'gegenpartei', 'verwendungszweck', 'kategorie', 'oberkategorie',
  'buchungsart', 'konto', 'quelle', 'steuerrolle',
]

const ID = /^[0-9a-f-]{36}$/i

/**
 * CSV-Injection: Excel wertet Zellen, die mit = + - @ (oder Tab/CR) beginnen, als Formel aus.
 * Gegenpartei und Verwendungszweck kommen von Dritten (jeder kann dir eine Ueberweisung mit
 * `=HYPERLINK(...)` als Zweck schicken). Ein vorangestelltes Apostroph macht die Zelle zu Text.
 * lib/csv maskiert nur Trennzeichen/Anfuehrungszeichen, deshalb hier — und NUR fuer Textspalten:
 * der Betrag (`-12,50`) ist legitim negativ und kommt nicht hier durch.
 */
function textZelle(value: string | null | undefined): string {
  if (value == null) return ''
  const s = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return escapeCsvValue(s)
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await getAuthUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const q = parseQuery(req, querySchema)
  if (q.response) return q.response
  const p = q.data
  // Scope: Cookie (wie die Seite, kein `?scope=`); Konten-IDs aus der URL werden auf die Konten im Scope geschnitten.
  const ctx = await resolveScope(supabase, user)

  // Konten-IDs gehen als Liste in eine Abfrage; was keine UUID ist, wird verworfen (und gehoert
  // dem Nutzer ohnehin nicht: die Abfrage filtert zusaetzlich auf user_id).
  const accountIds = p.accounts.split(',').map(s => s.trim()).filter(id => ID.test(id))
  const include = includeFromParam(
    p.anlage,
    flowDefaultFrom(p.anlage === undefined ? (await getSettings(user.id))[FLOW_DEFAULT_KEY] : undefined),
  )

  let txns
  try {
    txns = await getFlowTransactionsScope(supabase, ctx, {
      from: p.von || null,
      accountIds: accountIds.length > 0 ? accountIds : undefined,
      include,
    })
  } catch {
    return new Response('Error fetching transactions', { status: 500 })
  }

  const [{ data: kats }, konten] = await Promise.all([
    // Kategorienbaum pro Haushalt: die RLS liefert ihn, kein user_id-Filter.
    supabase.from('categories').select('id, parent_id'),
    getActiveAccountOptions(supabase, ctx),
  ])
  const kontoName = new Map(konten.map(k => [k.id, k.name]))

  const treffer = sortiereBuchungen(
    filterBuchungen(txns, {
      ...LEERER_FILTER,
      kat: p.kat,
      // Wie in der Liste: eine Hauptkategorie nimmt ihre Unterkategorien mit.
      katMenge: p.kat && p.kat !== 'offen'
        ? kategorieMitKindern(p.kat, (kats ?? []) as { id: string; parent_id: string | null }[])
        : undefined,
      monat: p.monat, tag: p.tag, partei: p.partei, q: p.q, typ: p.typ, art: p.art,
      min: parseBetrag(p.min), max: parseBetrag(p.max), konto: p.konto,
    }),
    { feld: 'datum', richtung: 'ab' },
  )

  const lines: string[] = [CSV_HEADERS.join(CSV_SEPARATOR)]
  for (const t of treffer) {
    lines.push([
      escapeCsvValue(t.date),
      escapeCsvValue(t.type === 'income' ? 'Einnahme' : 'Ausgabe'),
      formatCsvAmount(vorzeichen(t)),
      textZelle(parteiVon(t)),
      textZelle(t.description),
      textZelle(t.category_name),
      textZelle(t.root_category_name),
      textZelle(ART_LABEL[t.flow_kind] ?? t.flow_kind),
      textZelle(t.account_id ? kontoName.get(t.account_id) ?? null : null),
      textZelle(QUELLE_LABEL[t.source] ?? t.source),
      textZelle(t.tax_role ? STEUERROLLE_LABEL[t.tax_role] ?? t.tax_role : null),
    ].join(CSV_SEPARATOR))
  }

  return new Response(CSV_BOM + lines.join(CSV_EOL) + CSV_EOL, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="analyse-buchungen.csv"',
    },
  })
}
