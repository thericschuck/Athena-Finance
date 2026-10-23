import { test } from 'node:test'
import assert from 'node:assert/strict'
import { berechneHinweise, kurzText, median, parteiVon } from './insights.ts'
import type { InsightBuchung, InsightEingabe, InsightMonatsZeile } from './insights.ts'

// heute = 2026-10-23 -> letzter voller Monat ist 2026-09
const HEUTE = '2026-10-23'

function zeile(month: string, kat: string, expense: number, income = 0, kind = 'echt'): InsightMonatsZeile {
  return {
    month: `${month}-01`, flow_kind: kind, income, expense,
    root_category_id: kat, root_category_name: kat, category_id: kat, category_name: kat,
  }
}

function eingabe(
  zeilen: InsightMonatsZeile[], txns: InsightBuchung[] = [], cutoff: string | null = null,
  extra: Partial<InsightEingabe> = {},
): InsightEingabe {
  return { heute: HEUTE, locale: 'de-DE', cutoff, monatsZeilen: zeilen, txns, ...extra }
}

const basis = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']

function tx(id: string, date: string, amount: number, extra: Partial<InsightBuchung> = {}): InsightBuchung {
  return {
    id, date, type: 'expense', amount, flow_kind: 'echt', category_id: 'k', category_name: 'k',
    root_category_id: 'k', root_category_name: 'k', description: null, merchant: null, ...extra,
  }
}

test('median: gerade/ungerade/leer', () => {
  assert.equal(median([]), 0)
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([1, 2, 3, 10]), 2.5)
})

test('Kategorie ueber dem Schnitt: Reisen +340 %', () => {
  const z = [
    ...basis.map(m => zeile(m, 'Reisen', 100)),
    zeile('2026-09', 'Reisen', 440),
  ]
  const h = berechneHinweise(eingabe(z)).find(x => x.key === 'kat-ueber:2026-09:Reisen')
  assert.ok(h)
  assert.equal(h.ton, 'warnend')
  assert.match(h.titel, /Reisen \+340 %/)
  assert.deepEqual(h.ziel?.filter, { kat: 'Reisen', monat: '2026-09' })
})

test('Kategorie deutlich unter dem Schnitt ist positiv', () => {
  const z = [...basis.map(m => zeile(m, 'Essen', 400)), zeile('2026-09', 'Essen', 100)]
  const h = berechneHinweise(eingabe(z)).find(x => x.key.startsWith('kat-unter'))
  assert.ok(h)
  assert.equal(h.ton, 'positiv')
  assert.match(h.titel, /-75 %/)
})

test('Zu wenig Historie (3 Vergleichsmonate): schweigen', () => {
  const z = [...['2026-06', '2026-07', '2026-08'].map(m => zeile(m, 'Reisen', 100)), zeile('2026-09', 'Reisen', 900)]
  assert.equal(berechneHinweise(eingabe(z)).length, 0)
})

test('Monate ohne Daten zaehlen nicht als 0 EUR: Luecken verfaelschen den Schnitt nicht', () => {
  // Daten nur Mai-August + September; Maerz/April fehlen komplett. 4 Datenmonate genuegen.
  const z = [
    ...['2026-05', '2026-06', '2026-07', '2026-08'].map(m => zeile(m, 'Reisen', 200)),
    zeile('2026-09', 'Reisen', 210),
  ]
  assert.equal(berechneHinweise(eingabe(z)).length, 0)
})

test('Kein Datensatz fuer den letzten vollen Monat: schweigen', () => {
  const z = basis.map(m => zeile(m, 'Reisen', 100))
  assert.equal(berechneHinweise(eingabe(z)).length, 0)
})

test('Kleine Betraege bleiben stumm (Mindestschwellen)', () => {
  const z = [...basis.map(m => zeile(m, 'Kaffee', 10)), zeile('2026-09', 'Kaffee', 60)]
  assert.equal(berechneHinweise(eingabe(z)).length, 0)
})

test('Kategorie nur im letzten Monat (Schnitt 0) wird nicht prozentual gemeldet', () => {
  const z = [...basis.map(m => zeile(m, 'Basis', 500)), zeile('2026-09', 'Basis', 500), zeile('2026-09', 'Neu', 800)]
  assert.equal(berechneHinweise(eingabe(z)).some(h => h.key.includes('Neu')), false)
})

test('Gesamtausgaben hoch = warnend, Einnahmen runter = warnend', () => {
  const z = [
    ...basis.flatMap(m => [zeile(m, 'A', 1000, 3000)]),
    zeile('2026-09', 'A', 1500, 2000),
  ]
  const h = berechneHinweise(eingabe(z))
  const ausg = h.find(x => x.key === 'gesamt-expense-ueber:2026-09')
  const einn = h.find(x => x.key === 'gesamt-income-unter:2026-09')
  assert.equal(ausg?.ton, 'warnend')
  assert.equal(einn?.ton, 'warnend')
  assert.match(ausg!.titel, /\+50 %/)
})

test('Sparquote deutlich besser als Schnitt', () => {
  // Schnitt: 3000 Einnahmen, 2700 Ausgaben = 10 %; September: 3000/1500 = 50 %
  const z = [
    ...basis.map(m => zeile(m, 'A', 2700, 3000)),
    zeile('2026-09', 'A', 1500, 3000),
  ]
  const h = berechneHinweise(eingabe(z)).find(x => x.key === 'sparquote-besser:2026-09')
  assert.ok(h)
  assert.equal(h.ton, 'positiv')
  assert.match(h.text, /50 %.*10 %/)
})

test('Anlage zaehlt nicht in die Sparquote-Basis (nur echt)', () => {
  const z = [
    ...basis.map(m => zeile(m, 'A', 2700, 3000)),
    zeile('2026-09', 'A', 2700, 3000),
    zeile('2026-09', 'Depot', 2000, 0, 'anlage'),
  ]
  assert.equal(berechneHinweise(eingabe(z)).some(h => h.key.startsWith('sparquote')), false)
})

test('Rekord: hoechste Monatsausgaben seit 6 Monaten, wenn Regel 2 nicht schon anschlaegt', () => {
  // Ausgaben steigen knapp (unter 20 %), aber jeder Monat ist hoeher als alle davor
  const werte = [1000, 1010, 1020, 1030, 1040, 1050, 1060]
  const monate = [...basis, '2026-09']
  const z = monate.map((m, i) => zeile(m, 'A', werte[i], 3000))
  const h = berechneHinweise(eingabe(z)).find(x => x.key === 'rekord-hoch:2026-09')
  assert.ok(h)
  assert.match(h.titel, /seit Beginn deiner Daten/)
})

test('Neue Gegenpartei: nur mit ausreichend Historie, Text bleibt Text', () => {
  const alt = Array.from({ length: 6 }, (_, i) => tx(`a${i}`, `2026-0${3 + i}-05`, 50, { merchant: 'Bekannt' }))
  const neu = tx('n1', '2026-10-10', 240, { merchant: '  <b>Zoo</b>\n Berlin ' })
  const h = berechneHinweise(eingabe([], [...alt, neu])).find(x => x.key.startsWith('partei-neu'))
  assert.ok(h)
  assert.ok(!h.titel.includes('<'))
  assert.match(h.titel, /Zoo/)
  assert.equal(h.ton, 'neutral')
  // Daten beginnen erst vor 30 Tagen: nichts ist belegbar "neu"
  const kurz = berechneHinweise(eingabe([], [tx('x', '2026-10-05', 500, { merchant: 'Neu' })]))
  assert.equal(kurz.length, 0)
  // Zeitraum 1M (cutoff): auch schweigen
  const mitCutoff = berechneHinweise(eingabe([], [...alt, neu], '2026-09-23'))
  assert.equal(mitCutoff.some(x => x.key.startsWith('partei-neu')), false)
})

test('Bekannte Gegenpartei mit neuer Buchung ist nicht neu', () => {
  const alt = Array.from({ length: 6 }, (_, i) => tx(`a${i}`, `2026-0${3 + i}-05`, 50, { merchant: 'Bekannt' }))
  const wieder = tx('n1', '2026-10-10', 240, { merchant: 'BEKANNT' })
  assert.equal(berechneHinweise(eingabe([], [...alt, wieder])).some(h => h.key.startsWith('partei-neu')), false)
})

test('Ungewoehnlich grosse Buchung: > 3x Median, Mindestbetrag, Mindestanzahl', () => {
  const norm = Array.from({ length: 9 }, (_, i) => tx(`t${i}`, `2026-09-${10 + i}`, 40))
  const gross = tx('big', '2026-10-02', 400)
  const h = berechneHinweise(eingabe([], [...norm, gross])).find(x => x.key === 'buchung-gross:big')
  assert.ok(h)
  assert.deepEqual(h.ziel?.filter, { kat: 'k', tag: '2026-10-02' })
  // zu wenige Buchungen in der Kategorie
  assert.equal(berechneHinweise(eingabe([], [...norm.slice(0, 3), gross])).length, 0)
  // unter der absoluten Schwelle
  const klein = tx('kl', '2026-10-02', 140)
  assert.equal(berechneHinweise(eingabe([], [...norm, klein])).length, 0)
})

test('Ziel mit Monat entfaellt, wenn der Monat vor dem Zeitraum liegt', () => {
  const z = [...basis.map(m => zeile(m, 'Reisen', 100)), zeile('2026-09', 'Reisen', 440)]
  const h = berechneHinweise(eingabe(z, [], '2026-10-01')).find(x => x.key.startsWith('kat-ueber'))
  assert.ok(h)
  assert.equal(h.ziel, null)
})

test('Reihenfolge: groessere Relevanz zuerst, stabil', () => {
  const z = [
    ...basis.map(m => zeile(m, 'Reisen', 100)),
    zeile('2026-09', 'Reisen', 440),
    ...basis.map(m => zeile(m, 'Essen', 300)),
    zeile('2026-09', 'Essen', 150),
  ]
  const h = berechneHinweise(eingabe(z))
  assert.ok(h[0].key.includes('Reisen'))
  assert.deepEqual(h.map(x => x.key), berechneHinweise(eingabe(z)).map(x => x.key))
})

test('kurzText / parteiVon: Steuerzeichen, Tags, Laenge', () => {
  assert.equal(kurzText('a\u0000b\n\tc'), 'a b c')
  assert.ok(kurzText('x'.repeat(100)).length <= 34)
  assert.equal(parteiVon({ merchant: null, description: null }), null)
  assert.equal(parteiVon({ merchant: 'REWE  Markt', description: null })?.schluessel, 'rewe markt')
  assert.equal(parteiVon({ merchant: null, description: null }), null)
})

test('Neutrale Kategorien (Transfers) sind von Regel 1 und 4 ausgenommen', () => {
  const z = [...basis.map(m => zeile(m, 'Transfers', 100)), zeile('2026-09', 'Transfers', 2000)]
  assert.equal(berechneHinweise(eingabe(z)).some(h => h.key.startsWith('kat-')), true)
  assert.equal(
    berechneHinweise(eingabe(z, [], null, { neutraleKategorien: ['Transfers'] })).some(h => h.key.startsWith('kat-')),
    false,
  )
  const norm = Array.from({ length: 9 }, (_, i) => tx(`t${i}`, `2026-09-${10 + i}`, 40))
  const gross = tx('big', '2026-10-02', 400)
  assert.equal(berechneHinweise(eingabe([], [...norm, gross], null, { neutraleKategorien: ['k'] })).length, 0)
})

test('Erster Historienmonat geht nicht in den Schnitt ein; Mindestzahl wird danach neu geprueft', () => {
  // Maerz ist der unvollstaendige Startmonat mit 0 EUR; ohne Ausschluss laege der Median bei 100 -> kein Hinweis niedrig.
  const z = [
    zeile('2026-03', 'Essen', 0), ...basis.slice(1).map(m => zeile(m, 'Essen', 400)), zeile('2026-09', 'Essen', 200),
  ]
  const mit = berechneHinweise(eingabe(z, [], null, { fruehesterMonat: '2026-03-01' }))
  // 5 Basismonate (Apr-Aug) bleiben, Median 400, September 200 = -50 %
  assert.ok(mit.some(h => h.key === 'kat-unter:2026-09:Essen'))
  // Nur 4 Datenmonate inkl. Maerz: nach dem Ausschluss 3 -> schweigen
  const knapp = [zeile('2026-03', 'Essen', 400), ...['2026-06', '2026-07', '2026-08'].map(m => zeile(m, 'Essen', 400)), zeile('2026-09', 'Essen', 1200)]
  assert.equal(berechneHinweise(eingabe(knapp, [], null, { fruehesterMonat: '2026-03-01' })).length, 0)
  assert.ok(berechneHinweise(eingabe(knapp)).length > 0)
})
