import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  annahmeStatus, gruppiereAnnahmen, istEinnahmeArt, mischeUeberschreibung, prognoseKennzahlen,
  type PrognoseTagKurz,
} from './berechnen.ts'
import { pruefeAnnahme } from './annahme-eingabe.ts'

const tag = (datum: string, liq: number, unten: number, verm: number): PrognoseTagKurz =>
  ({ datum, liquiditaet: liq, liquiditaetUnten: unten, vermoegen: verm })

test('Kennzahlen: Ende, Monatsmittel und erster Minustag', () => {
  const k = prognoseKennzahlen({
    heute: '2026-10-26',
    start: { liquiditaet: 1000, vermoegen: 5000 },
    tage: [tag('2026-11-10', 400, -50, 5100), tag('2026-12-10', -100, -300, 5200), tag('2027-04-26', 700, 100, 6000)],
    tiefpunkt: { betrag: -100, datum: '2026-12-10' },
    risikoTiefpunkt: { betrag: -300, datum: '2026-12-10' },
  })
  assert.equal(k.ende?.datum, '2027-04-26')
  assert.equal(k.erstesMinus, '2026-12-10')
  assert.equal(k.erstesRisikoMinus, '2026-11-10')
  // 182 Tage = 5,98 Monate; Vermögen +1000
  assert.ok(Math.abs((k.vermoegenProMonat ?? 0) - 1000 / (182 / 30.4375)) < 0.01)
  assert.ok((k.liquiditaetProMonat ?? 0) < 0)
})

test('Kennzahlen: ohne Prognosetage und mit Minus schon heute', () => {
  const leer = prognoseKennzahlen({
    heute: '2026-10-26', start: { liquiditaet: 10, vermoegen: 10 }, tage: [],
    tiefpunkt: { betrag: 10, datum: '2026-10-26' }, risikoTiefpunkt: { betrag: 10, datum: '2026-10-26' },
  })
  assert.equal(leer.ende, null)
  assert.equal(leer.vermoegenProMonat, null)
  const minus = prognoseKennzahlen({
    heute: '2026-10-26', start: { liquiditaet: -5, vermoegen: 10 }, tage: [tag('2026-10-27', -6, -9, 10)],
    tiefpunkt: { betrag: -6, datum: '2026-10-27' }, risikoTiefpunkt: { betrag: -9, datum: '2026-10-27' },
  })
  assert.equal(minus.erstesMinus, null)
})

test('Annahmen: Status und Gruppierung', () => {
  const a = (id: string, von: string, bis: string | null) => ({ id, art: 'ausgabe' as const, von, bis })
  assert.equal(annahmeStatus(a('1', '2026-01', '2026-09'), '2026-10', '2027-09'), 'beendet')
  assert.equal(annahmeStatus(a('2', '2026-10', null), '2026-10', '2027-09'), 'laufend')
  assert.equal(annahmeStatus(a('3', '2026-06', '2026-10'), '2026-10', '2027-09'), 'laufend')
  assert.equal(annahmeStatus(a('4', '2027-01', null), '2026-10', '2027-09'), 'geplant')
  assert.equal(annahmeStatus(a('5', '2027-10', null), '2026-10', '2027-09'), 'ausserhalb')
  const g = gruppiereAnnahmen([a('4', '2027-01', null), a('1', '2026-01', '2026-09'), a('2', '2026-10', null)], '2026-10', '2027-09')
  assert.deepEqual(g.map(x => x.status), ['laufend', 'geplant', 'beendet'])
  assert.equal(istEinnahmeArt('lohn'), true)
  assert.equal(istEinnahmeArt('betriebsausgabe'), false)
})

test('Formular: eine Betragsregel (deutsche Schreibweise)', () => {
  const basis = { label: ' Gehalt ', art: 'lohn', von: '2027-01', bis: '', betrag: '1.500', brutto: '2.345,67' }
  const r = pruefeAnnahme(basis)
  assert.ok(r.ok)
  if (r.ok) {
    assert.equal(r.wert.betrag, 1500)
    assert.equal(r.wert.brutto, 2345.67)
    assert.equal(r.wert.label, 'Gehalt')
    assert.equal(r.wert.bis, null)
  }
  const komma = pruefeAnnahme({ ...basis, betrag: '1.234,56', art: 'ausgabe' })
  assert.ok(komma.ok && komma.wert.betrag === 1234.56 && komma.wert.brutto === null)
})

test('Formular: ungültige Eingaben werden mit Text abgelehnt', () => {
  const ok = { label: 'x', art: 'ausgabe', von: '2027-01', bis: '', betrag: '10', brutto: '' }
  assert.equal(pruefeAnnahme({ ...ok, label: ' ' }).ok, false)
  assert.equal(pruefeAnnahme({ ...ok, art: 'foo' }).ok, false)
  assert.equal(pruefeAnnahme({ ...ok, von: '2027-13' }).ok, false)
  assert.equal(pruefeAnnahme({ ...ok, bis: '2026-12' }).ok, false)
  assert.equal(pruefeAnnahme({ ...ok, betrag: '' }).ok, false)
  assert.equal(pruefeAnnahme({ ...ok, betrag: 'abc' }).ok, false)
  assert.equal(pruefeAnnahme({ ...ok, betrag: '-5' }).ok, false)
  assert.equal(pruefeAnnahme({ ...ok, betrag: '99999999999' }).ok, false)
})

test('Einmalposten: unsichtbare Entscheidungen bleiben, fremde Ids fallen heraus', () => {
  const r = mischeUeberschreibung(
    { aus: ['a', 'b'], ein: ['c'] },
    ['a', 'c', 'd', 'x'],
    { aus: ['d', 'x'], ein: [] },
    new Set(['a', 'b', 'c', 'd']),
  )
  assert.deepEqual(r.aus.sort(), ['b', 'd'])
  assert.deepEqual(r.ein, [])
})
