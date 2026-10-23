import { test } from 'node:test'
import assert from 'node:assert/strict'
import { baueGeldfluss, kurzBetrag, normalisiereSankey, zuFlussListe } from './geldfluss.ts'
import type { FlowTransaction } from '../data/flows.ts'

let nr = 0
function tx(over: Partial<FlowTransaction> & Pick<FlowTransaction, 'type' | 'amount'>): FlowTransaction {
  nr++
  return {
    id: `t${nr}`, date: '2026-10-01', flow_kind: 'echt', source: 'bank', account_id: null,
    category_id: null, category_name: null, root_category_id: null, root_category_name: null,
    description: null, merchant: null, tax_role: null,
    ...over,
  }
}
const ausgabe = (name: string, id: string | null, amount: number, flow_kind = 'echt') =>
  tx({ type: 'expense', amount, root_category_id: id, root_category_name: name, flow_kind })
const einnahme = (name: string, id: string | null, amount: number, flow_kind = 'echt') =>
  tx({ type: 'income', amount, root_category_id: id, root_category_name: name, flow_kind })

test('leere Buchungen: leeres Diagramm', () => {
  assert.deepEqual(baueGeldfluss([]), { nodes: [], links: [] })
})

test('Überschuss: Bilanz geht auf, kategorieId kommt mit, Bandbreiten sind echte Beträge', () => {
  const d = baueGeldfluss([einnahme('Gehalt', 'g', 3000), ausgabe('Miete', 'm', 1000), ausgabe('Essen', 'e', 500)])
  assert.deepEqual(d.nodes.map(n => n.name), ['Gehalt', 'Einnahmen', 'Miete', 'Essen', 'Überschuss'])
  assert.equal(d.nodes[2].kategorieId, 'm')
  const sum = (f: (l: { source: number; target: number }) => boolean) => d.links.filter(f).reduce((s, l) => s + l.value, 0)
  assert.equal(sum(l => l.target === 1), 3000)
  assert.equal(sum(l => l.source === 1), 3000)
  assert.ok(d.links.every(l => l.value === l.realValue))
})

test('Mehr Ausgaben als Einnahmen: Fehlbetrag speist die Mitte, nichts wird gestaucht', () => {
  const d = baueGeldfluss([einnahme('Gehalt', 'g', 1000), ausgabe('Miete', 'm', 1500)])
  assert.deepEqual(d.nodes.map(n => n.art), ['quelle', 'defizit', 'einnahmen', 'ausgabe'])
  const miete = d.links.find(l => l.target === 3)
  assert.equal(miete?.value, 1500)
  const fehl = d.links.find(l => l.source === 1)
  assert.equal(fehl?.value, 500)
  assert.ok(!d.nodes.some(n => n.art === 'ueberschuss'))
})

test('Top-N: der Rest wird zu „Weitere" mit Inhalt; ein einzelner Rest bleibt einzeln', () => {
  const viele = Array.from({ length: 10 }, (_, i) => ausgabe(`K${i}`, `k${i}`, 100 - i))
  const d = baueGeldfluss([einnahme('Gehalt', 'g', 5000), ...viele], { maxAusgaben: 7 })
  const weitere = d.nodes.find(n => n.art === 'weitere')
  assert.equal(weitere?.name, 'Weitere (3)')
  assert.equal(weitere?.kategorieId, undefined)
  assert.equal(weitere?.enthalten?.length, 3)
  assert.equal(weitere?.betrag, 93 + 92 + 91)

  const acht = Array.from({ length: 8 }, (_, i) => ausgabe(`K${i}`, `k${i}`, 100 - i))
  const d2 = baueGeldfluss([einnahme('Gehalt', 'g', 5000), ...acht], { maxAusgaben: 7 })
  assert.ok(!d2.nodes.some(n => n.art === 'weitere'))
  assert.equal(d2.nodes.filter(n => n.art === 'ausgabe').length, 8)
})

test('Summen bleiben vollständig, auch wenn viele Posten eingesammelt werden', () => {
  const viele = Array.from({ length: 12 }, (_, i) => ausgabe(`K${i}`, `k${i}`, 10))
  const d = baueGeldfluss([einnahme('Gehalt', 'g', 1000), ...viele])
  const l = zuFlussListe(d)
  assert.equal(l.summeAusgaben, 120)
  assert.equal(l.summeEinnahmen, 1000)
  assert.equal(l.saldo, 880)
})

test('Anlagen sind ein eigener Fluss und werden nie in „Weitere" eingesammelt', () => {
  const kleine = Array.from({ length: 9 }, (_, i) => ausgabe(`K${i}`, `k${i}`, 50 + i))
  const d = baueGeldfluss([
    einnahme('Gehalt', 'g', 4000),
    ausgabe('Krypto', 'kr', 5, 'anlage'), ausgabe('Depot', 'de', 5, 'anlage'),
    ...kleine,
  ])
  const anlage = d.nodes.filter(n => n.art === 'anlage')
  assert.equal(anlage.length, 1)
  assert.equal(anlage[0].name, 'Anlagen')
  assert.equal(anlage[0].betrag, 10)
  assert.equal(anlage[0].kategorieId, undefined)
})

test('Ohne Kategorie bekommt die kategorieId "offen"', () => {
  const d = baueGeldfluss([einnahme('Gehalt', 'g', 100), tx({ type: 'expense', amount: 40 })])
  assert.equal(d.nodes.find(n => n.name === 'Ohne Kategorie')?.kategorieId, 'offen')
})

test('Zwei Hauptkategorien mit gleichem Namen bleiben getrennt (Schlüssel = ID)', () => {
  const d = baueGeldfluss([einnahme('Gehalt', 'g', 500), ausgabe('Sonstiges', 'a', 10), ausgabe('Sonstiges', 'b', 20)])
  assert.equal(d.nodes.filter(n => n.name === 'Sonstiges').length, 2)
})

test('Fluss-Liste: Anteile, Skala und Saldo', () => {
  const d = baueGeldfluss([einnahme('Gehalt', 'g', 2000), ausgabe('Miete', 'm', 1000), ausgabe('Essen', 'e', 500)])
  const l = zuFlussListe(d)
  assert.equal(l.einnahmen.length, 1)
  assert.equal(l.einnahmen[0].anteil, 1)
  assert.equal(l.ausgaben[0].name, 'Miete')
  assert.equal(l.ausgaben[0].anteil, 0.5)
  assert.equal(l.ausgaben[0].breite, 0.5)
  assert.equal(l.saldo, 500)
  assert.equal(l.bezug, 'einnahmen')
})

test('Fluss-Liste im Defizit: Fehlbetrag erscheint nicht als Quelle, Saldo ist negativ, Skala = Ausgaben', () => {
  const l = zuFlussListe(baueGeldfluss([einnahme('Gehalt', 'g', 1000), ausgabe('Miete', 'm', 1500)]))
  assert.deepEqual(l.einnahmen.map(z => z.name), ['Gehalt'])
  assert.equal(l.saldo, -500)
  assert.equal(l.ausgaben[0].breite, 1)
  assert.equal(l.einnahmen[0].breite, 1000 / 1500)
})

test('Fluss-Liste ohne Einnahmen: Anteile beziehen sich auf die Ausgaben (keine Division durch 0)', () => {
  const l = zuFlussListe(baueGeldfluss([ausgabe('Miete', 'm', 300), ausgabe('Essen', 'e', 100)]))
  assert.equal(l.bezug, 'ausgaben')
  assert.equal(l.ausgaben[0].anteil, 0.75)
  assert.equal(l.summeEinnahmen, 0)
})

test('Demodaten ohne Rollen werden normalisiert und als Liste lesbar', () => {
  const demo = {
    nodes: [{ name: 'Gehalt' }, { name: 'Einnahmen' }, { name: 'Miete' }, { name: 'Überschuss' }],
    links: [
      { source: 0, target: 1, value: 3000 },
      { source: 1, target: 2, value: 1000 },
      { source: 1, target: 3, value: 2000 },
    ],
  }
  const n = normalisiereSankey(demo)
  assert.deepEqual(n.nodes.map(x => x.art), ['quelle', 'einnahmen', 'ausgabe', 'ueberschuss'])
  assert.equal(n.nodes[1].betrag, 3000)
  const l = zuFlussListe(demo)
  assert.equal(l.saldo, 2000)
  assert.equal(l.ausgaben.length, 1)
  // schon vollständige Daten bleiben dieselbe Referenz
  const voll = baueGeldfluss([einnahme('Gehalt', 'g', 10)])
  assert.equal(normalisiereSankey(voll), voll)
})

test('kurzBetrag kürzt für enge Zellen', () => {
  assert.equal(kurzBetrag(0), '0')
  assert.equal(kurzBetrag(950), '950')
  assert.equal(kurzBetrag(1234), '1,2k')
  assert.equal(kurzBetrag(2000), '2k')
  assert.equal(kurzBetrag(12500), '12,5k')
  assert.equal(kurzBetrag(1_250_000), '1,3M')
  assert.equal(kurzBetrag(-1234), '1,2k')
})
