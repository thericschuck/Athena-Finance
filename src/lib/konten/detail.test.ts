import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buchungsTitel, rechneDetail, saldoSpanne, type DetailBuchung } from './detail.ts'

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

test('Gegenparteien: nur Fluss-Ausgaben mit Empfänger, zusammengefasst unabhängig von der Schreibweise', () => {
  const rows = [
    b('2026-08-01', 'expense', 20, { merchant: 'Rewe' }),
    b('2026-08-05', 'expense', 30, { merchant: 'REWE' }),
    b('2026-08-06', 'expense', 100, { merchant: 'Vermieter' }),
    b('2026-08-07', 'expense', 9, { description: 'ohne Empfänger' }),
    b('2026-08-08', 'transfer', 500, { flow_kind: 'umbuchung', merchant: 'Eigenes Konto' }),
    b('2026-08-09', 'income', 3000, { merchant: 'Arbeitgeber' }),
  ]
  const r = rechneDetail(rows, { cutoff: null })
  assert.deepEqual(r.gegenparteien.map((g) => [g.name, g.total, g.anzahl]), [['Vermieter', 100, 1], ['Rewe', 50, 2]])
})

test('Größte Buchungen: je drei, absteigend, Titel aus Empfänger oder Beschreibung', () => {
  const rows = [
    b('2026-08-01', 'expense', 10, { description: 'Kaffee' }),
    b('2026-08-02', 'expense', 700, { merchant: 'Vermieter' }),
    b('2026-08-03', 'expense', 80, { merchant: 'Rewe' }),
    b('2026-08-04', 'expense', 40, { merchant: 'Tankstelle' }),
    b('2026-08-05', 'income', 2500, { description: 'Gehalt' }),
    b('2026-08-06', 'income', 5000, { flow_kind: 'anfangsbestand', description: 'Alter Kontostand' }),
  ]
  const r = rechneDetail(rows, { cutoff: null })
  assert.deepEqual(r.groessteAusgaben.map((x) => [x.titel, x.betrag]), [['Vermieter', 700], ['Rewe', 80], ['Tankstelle', 40]])
  assert.deepEqual(r.groessteEinnahmen.map((x) => [x.titel, x.betrag]), [['Gehalt', 2500]])
})

test('Ø pro Monat: Summe durch Monate mit Buchungen; ohne Monate null', () => {
  const r = rechneDetail(
    [b('2026-08-01', 'income', 3000), b('2026-08-02', 'expense', 1000), b('2026-09-01', 'expense', 500)],
    { cutoff: null },
  )
  assert.deepEqual(r.proMonat, { einnahmen: 1500, ausgaben: 750, monate: 2 })
  assert.equal(rechneDetail([], { cutoff: null }).proMonat, null)
})

test('Saldo-Spanne: tiefster/höchster Stand; zu wenige Punkte -> null; Gleichstand der jüngste Tag', () => {
  const s = saldoSpanne([
    { snapshot_date: '2026-01-01', balance: 100 },
    { snapshot_date: '2026-02-01', balance: -50 },
    { snapshot_date: '2026-03-01', balance: 400 },
    { snapshot_date: '2026-04-01', balance: 400 },
  ])
  assert.deepEqual(s, { tiefst: { date: '2026-02-01', balance: -50 }, hoechst: { date: '2026-04-01', balance: 400 } })
  assert.equal(saldoSpanne([{ snapshot_date: '2026-01-01', balance: 1 }]), null)
})

test('Titel: Empfänger vor Beschreibung, eine Zeile, gekürzt', () => {
  assert.equal(buchungsTitel({ merchant: ' Rewe ', description: 'x' }), 'Rewe')
  assert.equal(buchungsTitel({ merchant: null, description: 'a\nb' }), 'a b')
  assert.equal(buchungsTitel({ merchant: null, description: null }), 'Ohne Bezeichnung')
  assert.equal(buchungsTitel({ merchant: 'x'.repeat(80), description: null }).length, 48)
})
