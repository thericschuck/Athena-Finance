import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aktivesPreset,
  filterAktiv,
  filterAlsParameter,
  parseFilter,
  zeitraumPreset,
} from './filter.ts'
import { gruppiereNachTag, gruppierenSinnvoll, markiereTreffer, summiereTreffer, tagLabel } from './berechnen.ts'

const ID = '6e8ff680-f844-45b9-81a6-3f8cefc2aff3'

test('Filter lesen: gültige Werte bleiben, ungültige fallen weg', () => {
  const f = parseFilter({
    type: 'expense', art: 'anlage', account: ID.toUpperCase(), category: 'none',
    from: '2026-01-01', to: '2026-02-30', q: '  rewe ', min: '10,5', max: 'abc', sort: 'amount-desc',
  })
  assert.deepEqual(f, {
    type: 'expense', art: 'anlage', account: ID, category: 'none', from: '2026-01-01', q: 'rewe', min: 10.5, sort: 'amount-desc',
  })
})

test('Filter lesen: Investition war nie ein Typ; unbekannte Werte, kaputte IDs, Sortierung', () => {
  const f = parseFilter({ type: 'investment', art: 'x', account: 'abc', category: '1; drop', sort: 'zufall' })
  assert.deepEqual(f, { sort: 'date-desc' })
})

test('Filter lesen: vertauschte Spannen werden getauscht; alter Parameter account_id gilt', () => {
  const f = parseFilter({ from: '2026-05-01', to: '2026-01-01', min: '50', max: '5', account_id: ID })
  assert.equal(f.from, '2026-01-01')
  assert.equal(f.to, '2026-05-01')
  assert.equal(f.min, 5)
  assert.equal(f.max, 50)
  assert.equal(f.account, ID)
})

test('Filter lesen: negative und riesige Beträge werden verworfen', () => {
  const f = parseFilter({ min: '-3', max: '1e15' })
  assert.equal(f.min, undefined)
  assert.equal(f.max, undefined)
})

test('Filter aktiv / als Parameter: Sortierung zählt nicht, Standard wird weggelassen', () => {
  assert.equal(filterAktiv(parseFilter({ sort: 'amount-asc' })), false)
  assert.equal(filterAktiv(parseFilter({ q: 'x' })), true)
  assert.equal(filterAktiv(parseFilter({ min: '0' })), true)
  assert.deepEqual(filterAlsParameter(parseFilter({ type: 'income', sort: 'date-desc' })), { type: 'income' })
  assert.deepEqual(filterAlsParameter(parseFilter({ sort: 'amount-asc', max: '9' })), { max: '9', sort: 'amount-asc' })
})

test('Zeitraum-Voreinstellungen', () => {
  assert.deepEqual(zeitraumPreset('monat', '2026-10-26'), { from: '2026-10-01', to: null })
  assert.deepEqual(zeitraumPreset('letzter-monat', '2026-10-26'), { from: '2026-09-01', to: '2026-09-30' })
  assert.deepEqual(zeitraumPreset('letzter-monat', '2026-01-15'), { from: '2025-12-01', to: '2025-12-31' })
  assert.deepEqual(zeitraumPreset('jahr', '2026-10-26'), { from: '2026-01-01', to: null })
  assert.deepEqual(zeitraumPreset('3m', '2026-10-26'), { from: '2026-07-26', to: null })
  // Monatsende wird gekappt statt in den Folgemonat zu laufen
  assert.deepEqual(zeitraumPreset('3m', '2026-05-31'), { from: '2026-02-28', to: null })
  assert.deepEqual(zeitraumPreset('12m', '2028-02-29'), { from: '2027-02-28', to: null })
  assert.deepEqual(zeitraumPreset('6m', '2026-01-31'), { from: '2025-07-31', to: null })
})

test('Aktives Preset: genau passend oder keins', () => {
  assert.equal(aktivesPreset('2026-10-01', undefined, '2026-10-26'), 'monat')
  assert.equal(aktivesPreset('2026-09-01', '2026-09-30', '2026-10-26'), 'letzter-monat')
  assert.equal(aktivesPreset('2026-10-02', undefined, '2026-10-26'), null)
  assert.equal(aktivesPreset(undefined, undefined, '2026-10-26'), null)
})

const z = (date: string, type: string, flow_kind: string, amount: number, signed_amount: number) => ({
  id: `${date}-${amount}`, date, type, flow_kind, amount, signed_amount,
})

test('Summen: nur Fluss, Umbuchungen und Anfangsbestände separat gezählt', () => {
  const s = summiereTreffer([
    z('2026-10-01', 'income', 'echt', 3000, 3000),
    z('2026-10-02', 'expense', 'echt', 800, -800),
    z('2026-10-03', 'expense', 'anlage', 200, -200),
    z('2026-10-04', 'transfer', 'umbuchung', 500, -500),
    z('2026-10-05', 'income', 'anfangsbestand', 99, 99),
  ])
  assert.deepEqual(s, { anzahl: 5, einnahmen: 3000, ausgaben: 1000, netto: 2000, ohneFluss: 2 })
  assert.deepEqual(summiereTreffer([]), { anzahl: 0, einnahmen: 0, ausgaben: 0, netto: 0, ohneFluss: 0 })
})

test('Tagesgruppen: Reihenfolge bleibt, Tagessumme mit Vorzeichen ohne Umbuchungen', () => {
  const g = gruppiereNachTag([
    z('2026-10-02', 'expense', 'echt', 30, -30),
    z('2026-10-02', 'income', 'echt', 10, 10),
    z('2026-10-02', 'transfer', 'umbuchung', 500, -500),
    z('2026-10-01', 'expense', 'echt', 5, -5),
  ])
  assert.deepEqual(g.map((x) => [x.date, x.summe, x.zeilen.length]), [['2026-10-02', -20, 3], ['2026-10-01', -5, 1]])
  assert.equal(gruppierenSinnvoll('date-asc'), true)
  assert.equal(gruppierenSinnvoll('amount-desc'), false)
})

test('Tageslabel: Heute, Gestern, Wochentag, Jahr nur wenn es nicht das laufende ist', () => {
  assert.equal(tagLabel('2026-10-26', '2026-10-26'), 'Heute')
  assert.equal(tagLabel('2026-10-25', '2026-10-26'), 'Gestern')
  assert.equal(tagLabel('2026-10-12', '2026-10-26'), 'Mo, 12. Okt.')
  assert.equal(tagLabel('2025-12-24', '2026-10-26'), 'Mi, 24. Dez. 2025')
  assert.equal(tagLabel('2026-02-28', '2026-03-01'), 'Gestern')
})

test('Treffer markieren: Groß/Klein egal, mehrere Treffer, kurze Suche markiert nichts', () => {
  assert.deepEqual(markiereTreffer('REWE Markt Rewe', 'rewe'), [
    { text: 'REWE', treffer: true },
    { text: ' Markt ', treffer: false },
    { text: 'Rewe', treffer: true },
  ])
  assert.deepEqual(markiereTreffer('Miete', 'x'), [{ text: 'Miete', treffer: false }])
  assert.deepEqual(markiereTreffer('Miete', undefined), [{ text: 'Miete', treffer: false }])
  assert.deepEqual(markiereTreffer('Miete', 'zzz'), [{ text: 'Miete', treffer: false }])
})
