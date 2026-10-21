import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderReportHtml } from './render-html.ts'
import type { ReportData, ReportTax } from './types.ts'

const BASIS: ReportData = {
  type: 'annual', periodStart: '2026-01-01', periodEnd: '2026-12-31', label: '2026', previousLabel: '2025',
  totals: { income: 1000, expenses: 500, net: 500 }, previousTotals: { income: 0, expenses: 0, net: 0 },
  topExpenseCategories: [], notableChanges: [], netWorth: { start: null, end: null, delta: null },
  openInsights: [], generatedAt: '2026-10-22T10:00:00Z',
}

const TAX: ReportTax = {
  year: 2026, profit: 1200, taxableIncome: 5000, estimatedTax: 0, marginalRatePct: 14, smallBusinessStatus: 'gruen',
  reserveTarget: 100, reserveActual: null,
  crypto: { taxableBalance: 900, toTax: 0, taxFreeGain: 300, allowance: 1000 },
  warnings: ['Der <Bruttolohn> ist geschätzt.'],
}

test('Ohne Opt-in steht kein Steuer-Anhang im Report', () => {
  const html = renderReportHtml(BASIS)
  assert.equal(html.includes('Steuer-Anhang'), false)
})

test('Mit Steuer-Anhang: Zahlen, Krypto-Zeilen, maskierte Warnung und Haftungshinweis', () => {
  const html = renderReportHtml({ ...BASIS, tax: TAX })
  assert.ok(html.includes('Steuer-Anhang 2026'))
  assert.ok(html.includes('kein Sparziel'))
  assert.ok(html.includes('Krypto: steuerfreier Gewinn'))
  assert.ok(html.includes('&lt;Bruttolohn&gt;'))
  assert.ok(html.includes('keine Steuerberatung'))
})

test('Ohne Krypto-Daten entfallen die Krypto-Zeilen; ein Fehler wird gezeigt statt verschwiegen', () => {
  assert.equal(renderReportHtml({ ...BASIS, tax: { ...TAX, crypto: null } }).includes('Krypto'), false)
  const fehler = renderReportHtml({ ...BASIS, taxError: 'Tarif <fehlt>' })
  assert.ok(fehler.includes('konnte nicht erstellt werden'))
  assert.ok(fehler.includes('Tarif &lt;fehlt&gt;'))
})
