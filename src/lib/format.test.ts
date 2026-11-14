import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fmtCurrency, fmtDate, fmtDateLong, fmtDateMonthShort, fmtNumber, fmtNumberRange, fmtPercent, fmtShares } from './format.ts'

test('format: Zahlen folgen der Locale der Einstellung number_format', () => {
  assert.equal(fmtNumber(1234.5, 'de-DE', 2), '1.234,50')
  assert.equal(fmtNumber(1234.5, 'en-US', 2), '1,234.50')
  assert.equal(fmtNumberRange(2, 'de-DE', 2, 4), '2,00')
  assert.equal(fmtNumberRange(2.12345, 'de-DE', 2, 4), '2,1235')
})

test('format: Prozent und Anteile', () => {
  assert.equal(fmtPercent(12.3, 'de-DE'), '12,30 %')
  assert.equal(fmtPercent(12.3, 'en-US'), '12.30 %')
  assert.equal(fmtShares(1.5, 'de-DE'), '1,5000')
  assert.equal(fmtShares(0.1234567, 'de-DE'), '0,123457')
  assert.equal(fmtShares(1.5, 'en-US'), '1.5000')
})

test('format: Euro mit Cent ist dasselbe wie die frueheren handgeschriebenen toLocaleString-Aufrufe', () => {
  for (const n of [0, 1.5, -1234.567, 1e6]) {
    for (const loc of ['de-DE', 'en-US', 'fr-FR']) {
      const alt = n.toLocaleString(loc, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
      assert.equal(fmtCurrency(n, 'EUR', loc, { fractionDigits: 2 }), alt)
    }
  }
})

test('format: Datum nach date_format, lange und kurze Form nach Locale', () => {
  assert.equal(fmtDate('2025-11-03T00:00:00', 'dd.MM.yyyy'), '03.11.2025')
  assert.equal(fmtDate('2025-11-03T00:00:00', 'MM/dd/yyyy'), '11/03/2025')
  assert.equal(fmtDate('2025-11-03T00:00:00', 'yyyy-MM-dd'), '2025-11-03')
  assert.match(fmtDateLong('2025-11-03', 'de-DE'), /^Mo\.?,? 03\. Nov\.? 2025$/)
  assert.match(fmtDateLong('2025-11-03', 'en-US'), /Mon/)
  assert.match(fmtDateMonthShort('2025-11-03', 'de-DE'), /^03\. Nov\.? 25$/)
})
