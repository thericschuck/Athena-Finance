import { test } from 'node:test'
import assert from 'node:assert/strict'
import { baueTage, typischerLohnTag, type FlussBuchung } from './historie.ts'

const b = (date: string, type: 'income' | 'expense', amount: number, flow_kind = 'echt', tax_role: string | null = null): FlussBuchung =>
  ({ date, type, amount, flow_kind, tax_role })

test('Tage: summiert je Tag, trennt Konsum von Anlage, Lohn nur bei Rolle lohn und echt', () => {
  const t = baueTage([
    b('2026-08-27', 'income', 600, 'echt', 'lohn'),
    b('2026-08-27', 'income', 100, 'echt'),
    b('2026-08-27', 'expense', 40),
    b('2026-08-27', 'expense', 300, 'anlage'),
    b('2026-08-27', 'income', 50, 'anlage', 'lohn'),   // Lohnrolle zählt nur bei echt
    b('2026-08-28', 'expense', 10),
  ])
  assert.equal(t.length, 2)
  assert.deepEqual(t[0], {
    datum: '2026-08-27', einnahmen: 750, ausgaben: 340, einnahmenEcht: 700, ausgabenEcht: 40, lohn: 600,
  })
  assert.equal(t[1].ausgaben, 10)
})

test('Tage: Umbuchungen und unbekannte Arten zählen nicht, Ergebnis ist aufsteigend sortiert', () => {
  const t = baueTage([b('2026-09-02', 'expense', 5), b('2026-09-01', 'expense', 7), b('2026-09-01', 'income', 99, 'umbuchung')])
  assert.deepEqual(t.map(x => x.datum), ['2026-09-01', '2026-09-02'])
  assert.equal(t[0].einnahmen, 0)
})

test('Tage: ohne Buchungen leer', () => {
  assert.deepEqual(baueTage([]), [])
})

test('Lohn-Tag: Median der Eingangstage', () => {
  assert.equal(typischerLohnTag(['2026-06-28', '2026-07-30', '2026-08-28']), 28)
  assert.equal(typischerLohnTag([]), null)
})
