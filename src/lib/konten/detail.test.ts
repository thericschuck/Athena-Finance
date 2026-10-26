import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rechneDetail, type DetailBuchung } from './detail.ts'

let n = 0
function b(date: string, type: string, amount: number, extra: Partial<DetailBuchung> = {}): DetailBuchung {
  n++
  return {
    id: `t${n}`, date, type, amount, flow_kind: 'echt', category_id: null, category_name: null,
    category_color: null, description: null, merchant: null, ...extra,
  }
}

const daten = [
  b('2026-08-05', 'income', 2000, { description: 'Gehalt' }),
  b('2026-08-10', 'expense', 300, { category_id: 'k1', category_name: 'Miete' }),
  b('2026-09-02', 'expense', 80, { category_id: 'k2', category_name: 'Essen', merchant: 'Rewe' }),
  b('2026-09-15', 'transfer', 500, { flow_kind: 'umbuchung' }),
  b('2026-09-20', 'income', 5000, { flow_kind: 'anfangsbestand', description: 'Alter Kontostand' }),
  b('2026-10-01', 'expense', 700, { category_id: 'k1', category_name: 'Miete' }),
]

test('Zeitraum: Cutoff schneidet, Umbuchung und Anfangsbestand zählen nicht als Fluss', () => {
  const r = rechneDetail(daten, { cutoff: '2026-09-01' })
  assert.equal(r.imZeitraum.length, 4)
  assert.equal(r.einnahmen, 0)
  assert.equal(r.ausgaben, 780)
  assert.equal(r.netto, -780)
  const alles = rechneDetail(daten, { cutoff: null })
  assert.equal(alles.einnahmen, 2000)
  assert.equal(alles.ausgaben, 1080)
})

test('Monate: aufsteigend, Ausgaben negativ, Netto = Summe', () => {
  const r = rechneDetail(daten, { cutoff: null })
  assert.deepEqual(r.monate.map((m) => m.month), ['2026-08', '2026-09', '2026-10'])
  assert.deepEqual(r.monate[0], { month: '2026-08', income: 2000, expense: -300, net: 1700 })
  assert.equal(r.monate[1].net, -80)
})

test('Monatsfilter: nur gültig, wenn der Monat im Zeitraum vorkommt; Kategorien folgen ihm', () => {
  const r = rechneDetail(daten, { cutoff: '2026-09-01', month: '2026-10' })
  assert.equal(r.aktiverMonat, '2026-10')
  assert.equal(r.imMonat.length, 1)
  assert.deepEqual(r.topKategorien.map((k) => [k.name, k.total]), [['Miete', 700]])
  const weg = rechneDetail(daten, { cutoff: '2026-09-01', month: '2026-08' })
  assert.equal(weg.aktiverMonat, null)
  assert.equal(weg.imMonat.length, 4)
})

test('Kategorien: nach Summe absteigend, ohne Kategorie benannt, genutzte IDs', () => {
  const r = rechneDetail([...daten, b('2026-10-03', 'expense', 10)], { cutoff: null })
  assert.equal(r.topKategorien[0].name, 'Miete')
  assert.equal(r.topKategorien[0].total, 1000)
  assert.ok(r.topKategorien.some((k) => k.name === 'Ohne Kategorie'))
  assert.deepEqual(r.genutzteKategorien.sort(), ['k1', 'k2'])
  assert.equal(r.kategorienMax, 1000)
})

test('Tabelle: Suche in Beschreibung und Empfänger, Kategorie, Typ', () => {
  assert.equal(rechneDetail(daten, { cutoff: null, q: 'rewe' }).tabelle.length, 1)
  assert.equal(rechneDetail(daten, { cutoff: null, q: 'GEHALT' }).tabelle.length, 1)
  assert.equal(rechneDetail(daten, { cutoff: null, cat: 'k1' }).tabelle.length, 2)
  assert.equal(rechneDetail(daten, { cutoff: null, cat: 'none' }).tabelle.length, 3)
  assert.equal(rechneDetail(daten, { cutoff: null, txtype: 'transfer' }).tabelle.length, 1)
  assert.equal(rechneDetail(daten, { cutoff: null, q: 'x' }).gefiltert, true)
  assert.equal(rechneDetail(daten, { cutoff: null }).gefiltert, false)
})

test('Sortierung: Datum absteigend (Standard), Betrag nach Größe', () => {
  assert.equal(rechneDetail(daten, { cutoff: null }).tabelle[0].date, '2026-10-01')
  assert.equal(rechneDetail(daten, { cutoff: null, sort: 'date-asc' }).tabelle[0].date, '2026-08-05')
  assert.equal(rechneDetail(daten, { cutoff: null, sort: 'amount-desc' }).tabelle[0].amount, 5000)
  assert.equal(rechneDetail(daten, { cutoff: null, sort: 'amount-asc' }).tabelle[0].amount, 80)
})

test('Seiten: Aufteilung, Klemmen auf gültige Seite, Rest auf der letzten', () => {
  const viele = Array.from({ length: 120 }, (_, i) => b(`2026-01-${String((i % 28) + 1).padStart(2, '0')}`, 'expense', i + 1))
  const r1 = rechneDetail(viele, { cutoff: null })
  assert.equal(r1.seiten, 3)
  assert.equal(r1.seitenZeilen.length, 50)
  const r3 = rechneDetail(viele, { cutoff: null, seite: 3 })
  assert.equal(r3.seitenZeilen.length, 20)
  assert.equal(rechneDetail(viele, { cutoff: null, seite: 99 }).seite, 3)
  assert.equal(rechneDetail(viele, { cutoff: null, seite: -4 }).seite, 1)
  assert.equal(rechneDetail([], { cutoff: null }).seiten, 1)
})
