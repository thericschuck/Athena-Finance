import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ausgabenStufe, baueRaster, einnahmenStufe, guvStufe, hatBetrag, tagPlus, wochentag, zellenIndex,
} from './heatmap.ts'

test('tagPlus: Monats- und Jahresgrenzen, Schaltjahr, Sommerzeit-Wechsel', () => {
  assert.equal(tagPlus('2026-01-01', -1), '2025-12-31')
  assert.equal(tagPlus('2024-02-28', 1), '2024-02-29')
  assert.equal(tagPlus('2026-03-28', 2), '2026-03-30')   // Sommerzeit beginnt 29.03.2026
  assert.equal(tagPlus('2026-10-25', 1), '2026-10-26')   // Sommerzeit endet 25.10.2026
})

test('wochentag: Montag = 0, Sonntag = 6', () => {
  assert.equal(wochentag('2026-10-19'), 0) // Montag
  assert.equal(wochentag('2026-10-23'), 4) // Freitag
  assert.equal(wochentag('2026-10-25'), 6) // Sonntag
})

test('baueRaster: 52 Wochen, letzte Woche endet heute, Folgetage sind null', () => {
  const r = baueRaster([], '2026-10-23') // Freitag
  assert.equal(r.wochen.length, 52)
  assert.ok(r.wochen.every(w => w.length === 7))
  const letzte = r.wochen[51]
  assert.equal(letzte[0]?.date, '2026-10-19')
  assert.equal(letzte[4]?.date, '2026-10-23')
  assert.equal(letzte[5], null)
  assert.equal(letzte[6], null)
  assert.equal(r.wochen[0][0]?.date, '2025-10-27')
})

test('baueRaster: Beträge landen auf dem richtigen Tag (kein Vortags-Versatz)', () => {
  const r = baueRaster([{ date: '2026-10-22', amount: 120, income: 5 }], '2026-10-23')
  const donnerstag = r.wochen[51][3]
  assert.equal(donnerstag?.date, '2026-10-22')
  assert.equal(donnerstag?.amount, 120)
  assert.equal(donnerstag?.income, 5)
  assert.equal(r.wochen[51][4]?.amount, 0)
})

test('baueRaster: Monatsmarken sitzen in der Woche des Monatsersten', () => {
  const r = baueRaster([], '2026-10-23')
  // 01.10.2026 ist ein Donnerstag, Woche ab Mo 28.09. — drei Wochen vor der letzten.
  assert.equal(r.monatsMarken.get(48), 9)
  assert.equal(r.monatsMarken.get(51), undefined)
})

test('Farbstufen: Grenzen', () => {
  assert.equal(ausgabenStufe(0), 0)
  assert.equal(ausgabenStufe(80), 1)
  assert.equal(ausgabenStufe(81), 2)
  assert.equal(ausgabenStufe(551), 5)
  assert.equal(einnahmenStufe(50), 1)
  assert.equal(einnahmenStufe(2501), 5)
  assert.equal(guvStufe(0, 0), 0)
  assert.equal(guvStufe(3000, 0), 5)
  assert.equal(guvStufe(0, 3000), -5)
  assert.equal(guvStufe(100, 100), 0)
})

test('zellenIndex: GuV ist um 5 verschoben, nie negativ', () => {
  const z = { date: '2026-01-01', amount: 3000, income: 0 }
  assert.equal(zellenIndex(z, 'guv'), 0)
  assert.equal(zellenIndex({ ...z, amount: 0 }, 'guv'), 5)
  assert.equal(zellenIndex(z, 'ausgaben'), 5)
  assert.equal(zellenIndex(z, 'einnahmen'), 0)
})

test('hatBetrag: je Ansicht', () => {
  const z = { date: '2026-01-01', amount: 10, income: 0 }
  assert.equal(hatBetrag(z, 'ausgaben'), true)
  assert.equal(hatBetrag(z, 'einnahmen'), false)
  assert.equal(hatBetrag(z, 'guv'), true)
})
