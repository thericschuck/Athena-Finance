import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ladeSteuerdaten } from '@/lib/tax/laden'
import { berechneEuer } from '@/lib/tax/euer'
import { berechneSteuerposition } from '@/lib/tax/position'
import { CSV_BOM, CSV_EOL, CSV_SEPARATOR, escapeCsvValue, formatCsvAmount } from '@/lib/csv'

/**
 * Das Steuerbüro-Paket: eine Datei, drei Abschnitte.
 *
 * Ein Steuerberater will nicht das Formular, sondern die Herleitung -- die
 * EUER-Summen, den Kontennachweis je Kategorie und die Einzelbuchungen, aus
 * denen beides entsteht. Drei getrennte Dateien waeren drei Anhaenge, die man
 * einzeln oeffnen muss; drei Abschnitte in einer Datei sind ein Anhang.
 *
 * Dialekt aus lib/csv.ts -- Semikolon, Dezimalkomma, BOM, CRLF. Deutsches
 * Excel oeffnet das mit einem Doppelklick richtig, und der Import derselben App
 * versteht es ebenfalls.
 */

const SP = CSV_SEPARATOR

function zeile(...felder: (string | number | null)[]): string {
  return felder
    .map(f => (typeof f === 'number' ? formatCsvAmount(f) : escapeCsvValue(f)))
    .join(SP)
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const roh = Number(req.nextUrl.searchParams.get('jahr'))
  const jahr = Number.isInteger(roh) && roh >= 2020 && roh <= 2100
    ? roh
    : new Date().getFullYear()

  let daten
  try {
    daten = await ladeSteuerdaten(supabase, user.id, jahr)
  } catch (fehler) {
    return new Response(
      fehler instanceof Error ? fehler.message : 'Nicht berechenbar.',
      { status: 500 },
    )
  }

  const e = berechneEuer({ jahr, ...daten.euer })
  const p = berechneSteuerposition(daten.eingaben)

  const zeilen: string[] = []

  // ── Kopf ───────────────────────────────────────────────────────────────────
  zeilen.push(zeile(`Einnahmenueberschussrechnung ${jahr}`))
  zeilen.push(zeile('Erstellt am', new Date().toISOString().slice(0, 10)))
  zeilen.push(zeile('Gewinnermittlung', 'Paragraph 4 Abs. 3 EStG, Zufluss-/Abflussprinzip'))
  zeilen.push(zeile('Umsatzsteuer', 'Kleinunternehmer nach Paragraph 19 UStG, keine USt ausgewiesen'))
  zeilen.push(zeile('Zeilennummern', `Anlage EUER Jahrgang ${e.zeilen_jahr}`))
  zeilen.push(zeile('Hinweis', 'Maschinell erstellt, keine Steuerberatung. Zeilennummern vor der Uebernahme pruefen.'))
  for (const w of [...e.warnungen, ...p.warnungen]) zeilen.push(zeile('Warnung', w))
  zeilen.push('')

  // ── 1) Die Formularzeilen ──────────────────────────────────────────────────
  zeilen.push(zeile('1. Anlage EUER'))
  zeilen.push(zeile('Zeile', 'Bezeichnung', 'Betrag EUR', 'Buchungen'))
  for (const z of e.einnahmen) zeilen.push(zeile(z.zeile, z.bezeichnung, z.betrag, z.buchungen.length))
  if (e.summe_einnahmen) {
    zeilen.push(zeile(e.summe_einnahmen.zeile, e.summe_einnahmen.bezeichnung, e.summe_einnahmen.betrag, null))
  }
  for (const z of e.ausgaben) zeilen.push(zeile(z.zeile, z.bezeichnung, z.betrag, z.buchungen.length))
  if (e.summe_ausgaben) {
    zeilen.push(zeile(e.summe_ausgaben.zeile, e.summe_ausgaben.bezeichnung, e.summe_ausgaben.betrag, null))
  }
  if (e.ergebnis) {
    zeilen.push(zeile(e.ergebnis.zeile, e.ergebnis.bezeichnung, e.ergebnis.betrag, null))
  }
  zeilen.push('')

  // ── 2) Kontennachweis ──────────────────────────────────────────────────────
  // Je Kategorie eine Zeile, mit der Formularzeile daneben. Das ist die
  // Bruecke, die ein Berater als erstes sehen will: welche Kategorie landet wo.
  zeilen.push(zeile('2. Kontennachweis je Kategorie'))
  zeilen.push(zeile('Kategorie', 'EUER-Zeile', 'Betrag EUR', 'Buchungen'))
  const jeKategorie = new Map<string, { zeile: number; betrag: number; anzahl: number }>()
  for (const z of [...e.einnahmen, ...e.ausgaben]) {
    for (const b of z.buchungen) {
      const vorhanden = jeKategorie.get(b.kategorie)
      const betrag = z.art === 'einnahme' ? b.betrag : -b.betrag
      if (vorhanden) {
        vorhanden.betrag = Math.round((vorhanden.betrag + betrag) * 100) / 100
        vorhanden.anzahl += 1
      } else {
        jeKategorie.set(b.kategorie, {
          zeile: z.zeile,
          betrag: Math.round(betrag * 100) / 100,
          anzahl: 1,
        })
      }
    }
  }
  for (const [kategorie, w] of Array.from(jeKategorie).sort((a, b) => a[1].zeile - b[1].zeile)) {
    zeilen.push(zeile(kategorie, w.zeile, w.betrag, w.anzahl))
  }
  zeilen.push('')

  // ── 3) Einzelbuchungen ─────────────────────────────────────────────────────
  zeilen.push(zeile('3. Einzelbuchungen'))
  zeilen.push(zeile('Datum', 'EUER-Zeile', 'Kategorie', 'Beschreibung', 'Betrag EUR'))
  const alle = [...e.einnahmen, ...e.ausgaben]
    .flatMap(z => z.buchungen.map(b => ({ z, b })))
    .sort((x, y) => x.b.datum.localeCompare(y.b.datum))
  for (const { z, b } of alle) {
    zeilen.push(zeile(b.datum, z.zeile, b.kategorie, b.beschreibung, Math.abs(b.betrag)))
  }

  const csv = CSV_BOM + zeilen.join(CSV_EOL) + CSV_EOL

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="euer-${jahr}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
