import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  berechneBudget, einkommensVergleich, fensterMonate, mindestNetto, ordneZu, statusVon, tageImMonat,
} from './budget.ts'

const kategorien = [
  { id: 'le', name: 'Lebenserhaltung', type: 'expense' },
  { id: 'lm', name: 'Lebensmittel', type: 'expense' },
  { id: 'dk', name: 'Drogerie & Körperpflege', type: 'expense' },
  { id: 'gh', name: 'Haushalt', type: 'expense' },
  { id: 'ei', name: 'Haushalt', type: 'income' },
]

test('Status-Grenzen: 80 % gelb, genau 100 % gelb, darüber rot', () => {
  assert.equal(statusVon(79.99, 100), 'gruen')
  assert.equal(statusVon(80, 100), 'gelb')
  assert.equal(statusVon(100, 100), 'gelb')
  assert.equal(statusVon(100.01, 100), 'rot')
})

test('Soll 0: ohne Ausgaben grün, mit Ausgaben rot', () => {
  assert.equal(statusVon(0, 0), 'gruen')
  assert.equal(statusVon(5, 0), 'rot')
})

test('Zuordnung: Name gleich, enthalten, sonst null; nur Ausgabenkategorien', () => {
  assert.equal(ordneZu('lebensmittel', kategorien), 'lm')
  assert.equal(ordneZu('Körperpflege', kategorien), 'dk')
  assert.equal(ordneZu('Haushalt', kategorien), 'gh')
  assert.equal(ordneZu('Freizeit', kategorien), null)
  assert.equal(ordneZu('Abo', kategorien), null)
})

test('Fenster mit mehreren Monaten: Soll = Monatsbudget x Monate; Alles ab frühestem Monat', () => {
  assert.equal(fensterMonate({ von: '2026-08-01', bis: '2026-10-01' }, null, '2026-10-23'), 3)
  assert.equal(fensterMonate(null, '2026-05-01', '2026-10-23'), 6)
  assert.equal(fensterMonate(null, null, '2026-10-23'), 1)
})

const budgets = [
  { id: 'b1', name: 'Lebensmittel', icon: null, monatsBudget: 400 },
  { id: 'b2', name: 'Haushalt', icon: null, monatsBudget: 80 },
  { id: 'b3', name: 'Freizeit', icon: null, monatsBudget: 100 },
  { id: 'b4', name: 'Leer', icon: null, monatsBudget: null },
]
const zeilen = [
  { month: '2026-09-01', category_id: 'lm', root_category_id: 'le', income: 0, expense: 300 },
  { month: '2026-10-01', category_id: 'lm', root_category_id: 'le', income: 0, expense: 340 },
  { month: '2026-10-01', category_id: 'gh', root_category_id: 'le', income: 0, expense: 90 },
  { month: '2026-10-01', category_id: null, root_category_id: null, income: 2500, expense: 0 },
]

test('Laufender Monat: Auslastung, Rest, Sortierung, offene Budgets, Prognose', () => {
  const e = berechneBudget({
    budgets, kategorien, zeilen, fenster: { von: '2026-10-01', bis: '2026-10-01' },
    fruehesterMonat: '2026-01-01', heute: '2026-10-15',
  })
  assert.equal(e.monate, 1)
  assert.deepEqual(e.zeilen.map(z => z.name), ['Haushalt', 'Lebensmittel'])
  const hh = e.zeilen[0]
  assert.equal(hh.ist, 90)
  assert.equal(hh.rest, -10)
  assert.equal(hh.status, 'rot')
  assert.equal(e.zeilen[1].status, 'gelb') // 340/400 = 85 %
  assert.deepEqual(e.offen.map(b => b.name), ['Freizeit']) // "Leer" ohne Betrag fällt weg
  assert.equal(e.gesamt?.soll, 480)
  assert.equal(e.gesamt?.ist, 430)
  const p = e.prognose!
  assert.equal(p.tageImMonat, 31)
  assert.equal(p.tageBisMonatsende, 16)
  assert.equal(Math.round(p.hochrechnung), Math.round(430 / 15 * 31))
  assert.equal(p.status, 'rot')
})

test('Zwei Monate: Soll verdoppelt, Ist summiert, Prognose nur wenn laufender Monat drin', () => {
  const e = berechneBudget({
    budgets, kategorien, zeilen, fenster: { von: '2026-09-01', bis: '2026-10-01' },
    fruehesterMonat: '2026-01-01', heute: '2026-10-15',
  })
  const lm = e.zeilen.find(z => z.name === 'Lebensmittel')!
  assert.equal(lm.soll, 800)
  assert.equal(lm.ist, 640)
  const alt = berechneBudget({
    budgets, kategorien, zeilen, fenster: { von: '2026-08-01', bis: '2026-09-01' },
    fruehesterMonat: '2026-01-01', heute: '2026-10-15',
  })
  assert.equal(alt.prognose, null)
  assert.equal(alt.zeilen.find(z => z.name === 'Lebensmittel')!.ist, 300)
})

test('Ohne passendes Budget: kein Gesamt, keine Prognose', () => {
  const e = berechneBudget({
    budgets: [], kategorien, zeilen, fenster: null, fruehesterMonat: null, heute: '2026-10-15',
  })
  assert.equal(e.gesamt, null)
  assert.equal(e.prognose, null)
})

test('Hauptkategorie sammelt Unterkategorien über root_category_id', () => {
  const e = berechneBudget({
    budgets: [{ id: 'x', name: 'Lebenserhaltung', icon: null, monatsBudget: 1000 }],
    kategorien, zeilen, fenster: { von: '2026-10-01', bis: '2026-10-01' },
    fruehesterMonat: null, heute: '2026-10-15',
  })
  assert.equal(e.zeilen[0].ist, 430)
})

test('Mindestnetto und Einkommensvergleich', () => {
  // 300 EUR / 30 Tage x 30 = 300 pro Monat; +10 % Puffer, +10 % Sparen
  const netto = mindestNetto([{ unit_price: 300, quantity: 1, interval_days: 30 }], {
    buffer_pct: 10, savings_pct: 10, tax_pct: 30,
  })
  assert.ok(Math.abs(netto - 363) < 1e-9)
  assert.equal(mindestNetto([], null), 0)
  assert.equal(einkommensVergleich(zeilen, null, 1, 0), null)
  const v = einkommensVergleich(zeilen, { von: '2026-10-01', bis: '2026-10-01' }, 1, 1000)!
  assert.equal(v.ist, 2500)
  assert.equal(v.erreicht, 2.5)
})

test('Tage im Monat', () => {
  assert.equal(tageImMonat('2026-02-10'), 28)
  assert.equal(tageImMonat('2028-02-10'), 29)
})
