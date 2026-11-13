import { test } from 'node:test'
import assert from 'node:assert/strict'
import { berechneHinweise, hinweiseFuerAnalyse, MAX_HINWEISE } from './insights.ts'
import type { InsightMonatsZeile } from './insights.ts'

// hinweiseFuerAnalyse (AUDIT.md C3): die Berechnung, die frueher in der Client-Komponente AnalyseInsights stand und jetzt
// auf dem Server laeuft. Ergebnis muss dasselbe sein wie vorher: neutrale Kategorien raus, hoechstens MAX_HINWEISE.

const HEUTE = '2026-10-23' // letzter voller Monat: 2026-09
const basis = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']

function zeile(month: string, kat: string, expense: number): InsightMonatsZeile {
  return {
    month: `${month}-01`, flow_kind: 'echt', income: 0, expense,
    root_category_id: kat, root_category_name: kat, category_id: kat, category_name: kat,
  }
}

/** Kategorie mit Ausreisser im September: erzeugt genau einen „ueber dem Schnitt“-Hinweis. */
const spitze = (kat: string, faktor = 4.4): InsightMonatsZeile[] => [
  ...basis.map(m => zeile(m, kat, 100)),
  zeile('2026-09', kat, 100 * faktor),
]

const eingabe = (monatsZeilen: InsightMonatsZeile[], categories: { id: string; type: string }[]) => ({
  heute: HEUTE, locale: 'de-DE', cutoff: null, monatsZeilen, txns: [], fruehesterMonat: null, categories,
})

test('hinweiseFuerAnalyse: gleiche Hinweise wie berechneHinweise, wenn nichts neutral ist', () => {
  const z = spitze('Reisen')
  const h = hinweiseFuerAnalyse(eingabe(z, [{ id: 'Reisen', type: 'expense' }]))
  const direkt = berechneHinweise({ heute: HEUTE, locale: 'de-DE', cutoff: null, monatsZeilen: z, txns: [], fruehesterMonat: null, neutraleKategorien: [] })
  assert.ok(h.length > 0)
  assert.deepEqual(h, direkt.slice(0, MAX_HINWEISE))
})

test('hinweiseFuerAnalyse: neutrale Hauptkategorien (Transfers) erzeugen keinen Kategorie-Hinweis', () => {
  // Nur die kategoriebezogenen Hinweise (`kat-…`, Regeln 1 und 4) blenden neutrale aus; der Hinweis zu den Gesamtausgaben (Regel 2) bleibt.
  const kategorieHinweise = (typ: string) =>
    hinweiseFuerAnalyse(eingabe(spitze('Transfer'), [{ id: 'Transfer', type: typ }])).filter(h => h.key.startsWith('kat-'))
  assert.ok(kategorieHinweise('expense').length > 0, 'Gegenprobe: ohne neutral gibt es einen Kategorie-Hinweis')
  assert.equal(kategorieHinweise('neutral').length, 0)
})

test('hinweiseFuerAnalyse: hoechstens MAX_HINWEISE, die relevantesten zuerst', () => {
  const kategorien = Array.from({ length: MAX_HINWEISE + 4 }, (_, i) => `K${i}`)
  const z = kategorien.flatMap((k, i) => spitze(k, 3 + i * 0.5))
  const alle = berechneHinweise({
    heute: HEUTE, locale: 'de-DE', cutoff: null, monatsZeilen: z, txns: [], fruehesterMonat: null, neutraleKategorien: [],
  })
  assert.ok(alle.length > MAX_HINWEISE, 'Testaufbau: mehr Hinweise als erlaubt')
  const h = hinweiseFuerAnalyse(eingabe(z, kategorien.map(id => ({ id, type: 'expense' }))))
  assert.equal(h.length, MAX_HINWEISE)
  assert.deepEqual(h.map(x => x.key), alle.slice(0, MAX_HINWEISE).map(x => x.key))
})

test('hinweiseFuerAnalyse: Ergebnis ist reine Daten (serialisierbar, ohne Funktionen)', () => {
  const h = hinweiseFuerAnalyse(eingabe(spitze('Reisen'), [{ id: 'Reisen', type: 'expense' }]))
  assert.deepEqual(JSON.parse(JSON.stringify(h)), h)
})
