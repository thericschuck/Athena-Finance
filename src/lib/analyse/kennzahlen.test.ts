import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  groessteBuchung, summenAusBuchungen, summenAusMonaten, tageImFenster, tageImMonat, tageZwischen,
  tonFuer, veraenderungProzent, veraenderungPunkte,
} from './kennzahlen.ts'

const KONSUM = { anlage: false, forderung: false }
const ALLE = { anlage: true, forderung: true }

const zeile = (month: string, flow_kind: string, income: number, expense: number, tx_count = 1) =>
  ({ month, flow_kind, income, expense, tx_count })

test('Tage: inklusive Grenzen, Monatslaengen, Schaltjahr', () => {
  assert.equal(tageZwischen('2026-07-01', '2026-10-23'), 115)
  assert.equal(tageZwischen('2026-10-23', '2026-10-23'), 1)
  assert.equal(tageImMonat('2026-02'), 28)
  assert.equal(tageImMonat('2028-02-10'), 29)
  assert.equal(tageImFenster({ von: '2026-03-01', bis: '2026-06-01' }), 31 + 30 + 31 + 30)
})

test('Summen aus Monaten: nur Fenster, Sparquote nur auf Konsum, Anzahl nach Sicht', () => {
  const z = [
    zeile('2026-06-01', 'echt', 3000, 2000, 10),   // ausserhalb
    zeile('2026-07-01', 'echt', 3000, 1500, 20),
    zeile('2026-07-01', 'anlage', 0, 500, 2),
    zeile('2026-08-01', 'echt', 3000, 2500, 30),
  ]
  const f = { von: '2026-07-01', bis: '2026-08-01' }
  const alle = summenAusMonaten(z, ALLE, f, 62)
  assert.equal(alle.einnahmen, 6000)
  assert.equal(alle.ausgaben, 4500)
  assert.equal(alle.netto, 1500)
  assert.equal(alle.anzahl, 52)
  // Sparquote: nur echt (6000 - 4000) / 6000 = 33 %, die Anlage zaehlt nicht als Konsum.
  assert.equal(alle.sparquote, 33)
  assert.equal(alle.ausgabenProTag, 4500 / 62)

  const konsum = summenAusMonaten(z, KONSUM, f, 62)
  assert.equal(konsum.ausgaben, 4000)
  assert.equal(konsum.anzahl, 50)
})

test('Summen aus Monaten: ohne Einnahmen keine Sparquote, ohne Tage kein Tagesschnitt', () => {
  const s = summenAusMonaten([zeile('2026-07-01', 'echt', 0, 100)], ALLE, { von: '2026-07-01', bis: '2026-07-01' }, 0)
  assert.equal(s.sparquote, null)
  assert.equal(s.ausgabenProTag, null)
})

test('Summen aus Buchungen (Alles): Tage ab der aeltesten Buchung', () => {
  const b = [
    { date: '2025-01-10', type: 'expense' as const, amount: 100, flow_kind: 'echt' },
    { date: '2025-01-11', type: 'income' as const, amount: 400, flow_kind: 'echt' },
    { date: '2025-01-12', type: 'expense' as const, amount: 900, flow_kind: 'anlage' },
  ]
  const s = summenAusBuchungen(b, KONSUM, '2025-01-19')
  assert.equal(s.ausgaben, 100)
  assert.equal(s.anzahl, 2)
  assert.equal(s.tage, 10)
  assert.equal(s.ausgabenProTag, 10)
})

test('Groesste Buchung je Art, Gleichstand: die aelteste', () => {
  const b = [
    { date: '2026-01-01', type: 'expense' as const, amount: 50, flow_kind: 'echt', id: 'a' },
    { date: '2026-01-02', type: 'expense' as const, amount: 80, flow_kind: 'echt', id: 'b' },
    { date: '2026-01-03', type: 'expense' as const, amount: 80, flow_kind: 'echt', id: 'c' },
    { date: '2026-01-04', type: 'income' as const, amount: 10, flow_kind: 'echt', id: 'd' },
  ]
  assert.equal(groessteBuchung(b, 'expense')?.id, 'b')
  assert.equal(groessteBuchung(b, 'income')?.id, 'd')
  assert.equal(groessteBuchung([], 'income'), null)
})

test('Veraenderung: Prozent nur mit Basis > 0, Punkte nur mit beiden Quoten', () => {
  assert.equal(veraenderungProzent(150, 100), 50)
  assert.equal(veraenderungProzent(50, 100), -50)
  assert.equal(veraenderungProzent(10, 0), null)
  assert.equal(veraenderungPunkte(30, 20), 10)
  assert.equal(veraenderungPunkte(null, 20), null)
})

test('Ton: Ausgaben-Anstieg schlecht, Einnahmen-Anstieg gut, 0 neutral', () => {
  assert.equal(tonFuer(12, false), 'schlecht')
  assert.equal(tonFuer(-12, false), 'gut')
  assert.equal(tonFuer(12, true), 'gut')
  assert.equal(tonFuer(-12, true), 'schlecht')
  assert.equal(tonFuer(0.4, true), 'neutral')
})
