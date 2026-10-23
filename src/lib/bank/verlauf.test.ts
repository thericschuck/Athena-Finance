import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addTage, ausduennen, gesamtVerlauf, saldoAm, saldoReihe, tageZwischen, tagesWerte, verlaufKennzahlen,
} from './verlauf.ts'

const b = (value_date: string, amount: number, entry_date: string | null = null) => ({ value_date, amount, entry_date })

test('Tagesrechnung: addTage und tageZwischen ueber Monats- und Sommerzeitgrenzen', () => {
  assert.equal(addTage('2026-03-01', -1), '2026-02-28')
  assert.equal(addTage('2026-10-25', 1), '2026-10-26')
  assert.deepEqual(tageZwischen('2026-03-28', '2026-03-31'), ['2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31'])
  assert.deepEqual(tageZwischen('2026-03-02', '2026-03-01'), [])
})

test('saldoReihe: rueckwaerts vom aktuellen Saldo, Eroeffnungspunkt, Tagesendsaldo, bis heute', () => {
  // Aktuell 100; +50 und -20 am 10.; +30 am 12. -> Eroeffnung 100 - 60 = 40
  const r = saldoReihe([b('2026-10-12', 30), b('2026-10-10', 50), b('2026-10-10', -20)], 100, '2026-10-15')
  assert.deepEqual(r, [
    { datum: '2026-10-09', saldo: 40 },
    { datum: '2026-10-10', saldo: 70 },
    { datum: '2026-10-12', saldo: 100 },
    { datum: '2026-10-15', saldo: 100 },
  ])
})

test('saldoReihe: Vorausbuchungen ausserhalb des gebuchten Saldos bleiben draussen', () => {
  const r = saldoReihe([b('2026-10-10', 50), b('2026-11-01', 500, '2026-11-01')], 100, '2026-10-15')
  assert.equal(r[0].saldo, 50)
  assert.equal(r[r.length - 1].saldo, 100)
})

test('saldoReihe: ohne Buchungen flache Linie auf heute', () => {
  assert.deepEqual(saldoReihe([], 12.5, '2026-10-15'), [{ datum: '2026-10-15', saldo: 12.5 }])
})

test('tagesWerte/saldoAm: Stufenfunktion, vor dem Journal gilt der Eroeffnungsstand', () => {
  const r = saldoReihe([b('2026-10-10', 50)], 100, '2026-10-15')
  assert.deepEqual(tagesWerte(r, ['2026-10-01', '2026-10-09', '2026-10-10', '2026-10-14']), [50, 50, 100, 100])
  assert.equal(saldoAm(r, '2026-10-15'), 100)
})

const konten = [
  { key: 'a', name: 'Giro', saldo: 100, buchungen: [b('2026-10-10', 150), b('2026-10-12', -80)] },
  { key: 'b', name: 'Tagesgeld', saldo: 500, buchungen: [b('2026-10-11', 500)] },
  { key: 'c', name: 'Anteile', saldo: 25, buchungen: [] },
]

test('gesamtVerlauf: Summe der Schichten = Gesamt, Start folgt dem fruehesten Eroeffnungsstand', () => {
  const t = gesamtVerlauf(konten, null, '2026-10-14')
  assert.equal(t[0].datum, '2026-10-09')
  for (const tag of t) assert.equal(tag.summe, tag.werte.reduce((a, c) => a + c, 0))
  // Giro: 30 -> 180 (10.) -> 100 (12.); Tagesgeld: 0 -> 500 (11.); Anteile konstant 25
  const am = (d: string) => t.find(x => x.datum === d)!
  assert.deepEqual(am('2026-10-09').werte, [30, 0, 25])
  assert.deepEqual(am('2026-10-11').werte, [180, 500, 25])
  assert.equal(am('2026-10-14').summe, 625)
})

test('gesamtVerlauf: Zeitraum kuerzt, liegt er vor dem Journal, wird nicht mit Leerlauf aufgefuellt', () => {
  assert.equal(gesamtVerlauf(konten, '2026-10-12', '2026-10-14')[0].datum, '2026-10-12')
  assert.equal(gesamtVerlauf(konten, '2020-01-01', '2026-10-14')[0].datum, '2026-10-09')
  assert.deepEqual(gesamtVerlauf([], null, '2026-10-14'), [])
})

test('verlaufKennzahlen: Tief, Hoch, Tage im Minus ueber die vollen Tageswerte', () => {
  const t = gesamtVerlauf([{ key: 'a', name: 'Giro', saldo: 10, buchungen: [b('2026-10-03', -50), b('2026-10-06', 60)] }], null, '2026-10-08')
  // Eroeffnung 0 (2.), -50 (3.-5.), +10 (6.-8.)
  const k = verlaufKennzahlen(t)!
  assert.deepEqual(k.tief, { datum: '2026-10-03', wert: -50 })
  assert.deepEqual(k.hoch, { datum: '2026-10-06', wert: 10 })
  assert.equal(k.tageImMinus, 3)
  assert.equal(k.aktuell, 10)
  assert.equal(verlaufKennzahlen([]), null)
})

test('ausduennen: begrenzt, behaelt Rand, Tief und Hoch; Schichten summieren sich weiter', () => {
  const tage = tageZwischen('2020-01-01', '2026-10-01').map((datum, i) => {
    const werte = [i % 97, 1000 - (i % 13)]
    return { datum, werte, summe: werte[0] + werte[1] }
  })
  tage[1234].werte = [-5000, 10]
  tage[1234].summe = -4990
  const d = ausduennen(tage, 200)
  assert.ok(d.length <= 204 && d.length >= 190)
  assert.equal(d[0].datum, tage[0].datum)
  assert.equal(d[d.length - 1].datum, tage[tage.length - 1].datum)
  assert.ok(d.some(x => x.datum === tage[1234].datum))
  assert.deepEqual(verlaufKennzahlen(d)!.tief, verlaufKennzahlen(tage)!.tief)
  for (const x of d) assert.equal(x.summe, x.werte.reduce((a, c) => a + c, 0))
  for (let i = 1; i < d.length; i++) assert.ok(d[i].datum > d[i - 1].datum)
  assert.equal(ausduennen(tage.slice(0, 50), 200).length, 50)
})
