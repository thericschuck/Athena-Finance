import { test } from 'node:test'
import assert from 'node:assert/strict'
import { erkenneEinmalposten, leseUeberschreibung, type EinmalBuchung } from './einmalig.ts'

let n = 0
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const b = (o: Partial<EinmalBuchung> & Pick<EinmalBuchung, 'amount' | 'type'>): EinmalBuchung => ({
  id: id(), date: '2026-03-10', flow_kind: 'echt', tax_role: null, gegenpartei: null, kategorie: null, ...o,
})

/** Alltag: viele kleine Posten, damit das 95. Perzentil klein bleibt (wie in den echten Daten). */
function alltag(): EinmalBuchung[] {
  const out: EinmalBuchung[] = []
  for (let i = 0; i < 200; i++) out.push(b({ type: 'expense', amount: 10 + (i % 40), date: `2026-0${1 + (i % 9)}-1${i % 9}`, gegenpartei: `laden ${i % 17}` }))
  for (let i = 0; i < 40; i++) out.push(b({ type: 'income', amount: 50 + i, date: `2026-0${1 + (i % 9)}-2${i % 9}`, gegenpartei: `kunde ${i}` }))
  return out
}
const HEUTE = '2026-10-21'

test('Extreme Ausreißer sind standardmäßig ausgeschlossen, mittelgroße Posten nur Vorschlag und drin', () => {
  const lbs = b({ type: 'income', amount: 9075, flow_kind: 'anlage', gegenpartei: 'LBS Süd' })
  const krypto = b({ type: 'expense', amount: 3000, flow_kind: 'anlage', gegenpartei: 'Payward' })
  const reise = b({ type: 'expense', amount: 705, gegenpartei: 'PayPal' })
  const r = erkenneEinmalposten([...alltag(), lbs, krypto, reise], { aus: [], ein: [] }, HEUTE)
  const nach = (x: EinmalBuchung) => r.kandidaten.find(k => k.id === x.id)!
  assert.equal(nach(lbs).extrem, true)
  assert.equal(nach(lbs).ausgeschlossen, true)
  assert.equal(nach(krypto).ausgeschlossen, true)
  assert.equal(nach(reise).extrem, false)
  assert.equal(nach(reise).ausgeschlossen, false)
  assert.ok(r.ausgeschlossen.has(lbs.id) && r.ausgeschlossen.has(krypto.id) && !r.ausgeschlossen.has(reise.id))
})

test('Gehalt und Geschäftseinnahmen sind nie Kandidaten, auch wenn sie extrem sind', () => {
  const lohn = b({ type: 'income', amount: 5000, tax_role: 'lohn' })
  const projekt = b({ type: 'income', amount: 1700, tax_role: 'betriebseinnahme' })
  const r = erkenneEinmalposten([...alltag(), lohn, projekt], { aus: [], ein: [] }, HEUTE)
  assert.equal(r.kandidaten.some(k => k.id === lohn.id || k.id === projekt.id), false)
  assert.equal(r.ausgeschlossen.size, 0)
})

test('Wiederkehrende Große (3× dieselbe Gegenpartei, ähnlicher Betrag) sind keine Kandidaten', () => {
  const raten = [1190, 1190, 1190, 1190].map((x, i) => b({ type: 'expense', amount: x, gegenpartei: 'MySales Consulting GmbH', date: `2026-0${6 + i}-0${3 + i}` }))
  const r = erkenneEinmalposten([...alltag(), ...raten], { aus: [], ein: [] }, HEUTE)
  assert.equal(r.kandidaten.some(k => raten.some(x => x.id === k.id)), false)
})

test('Dieselbe Firma in verschiedenen Schreibweisen zählt als eine Gegenpartei', () => {
  const namen = ['MySales Consulting GmbH', 'MySales Consulting – Coaching', 'MYSALES CONSULTING GMBH', 'MySales Consulting GmbH']
  const raten = namen.map((g, i) => b({ type: 'expense', amount: 1190, gegenpartei: g, date: `2026-0${6 + i}-0${3 + i}` }))
  const r = erkenneEinmalposten([...alltag(), ...raten], { aus: [], ein: [] }, HEUTE)
  assert.equal(r.kandidaten.some(k => raten.some(x => x.id === k.id)), false)
})

test('Gleiche Gegenpartei mit stark unterschiedlichen Beträgen gilt nicht als wiederkehrend', () => {
  const x = [900, 2500, 700].map(a => b({ type: 'expense', amount: a, gegenpartei: 'Payward Ireland Limited', flow_kind: 'anlage' }))
  const r = erkenneEinmalposten([...alltag(), ...x], { aus: [], ein: [] }, HEUTE)
  assert.equal(x.every(p => r.kandidaten.some(k => k.id === p.id)), true)
})

test('Überschreibung: Nutzer holt einen extremen Posten zurück oder schließt einen mittleren aus', () => {
  const lbs = b({ type: 'income', amount: 9075, flow_kind: 'anlage', gegenpartei: 'LBS' })
  const reise = b({ type: 'expense', amount: 705, gegenpartei: 'PayPal' })
  const r = erkenneEinmalposten([...alltag(), lbs, reise], { aus: [reise.id], ein: [lbs.id] }, HEUTE)
  assert.equal(r.ausgeschlossen.has(lbs.id), false)
  assert.equal(r.ausgeschlossen.has(reise.id), true)
  assert.equal(r.kandidaten.find(k => k.id === lbs.id)!.ausgeschlossen, false)
})

test('Gründe, Sortierung nach Betrag und Wirkung pro Monat mit Vorzeichen', () => {
  const bar = b({ type: 'expense', amount: 1000, kategorie: 'Transfers > Auszahlung', gegenpartei: 'VoBa' })
  const darlehen = b({ type: 'expense', amount: 800, flow_kind: 'forderung', gegenpartei: 'Sven' })
  const einmal = b({ type: 'expense', amount: 710, gegenpartei: 'Adyen' })
  const r = erkenneEinmalposten([...alltag(), einmal, darlehen, bar], { aus: [], ein: [] }, HEUTE)
  assert.deepEqual(r.kandidaten.map(k => k.betrag), [1000, 800, 710])
  assert.deepEqual(r.kandidaten.map(k => k.grund), ['Bargeld oder Überweisung', 'Darlehen oder Forderung', 'einmalige Gegenpartei'])
  assert.ok(r.kandidaten[0].effektProMonat < 0)
})

test('Ohne Buchungen oder ohne große Posten: leer', () => {
  assert.deepEqual(erkenneEinmalposten([], { aus: [], ein: [] }, HEUTE).kandidaten, [])
  assert.equal(erkenneEinmalposten(alltag(), { aus: [], ein: [] }, HEUTE).kandidaten.length, 0)
})

test('Umbuchungen und unbekannte Arten zählen nicht', () => {
  const u = b({ type: 'expense', amount: 5000, flow_kind: 'umbuchung' })
  assert.equal(erkenneEinmalposten([...alltag(), u], { aus: [], ein: [] }, HEUTE).kandidaten.length, 0)
})

test('Überschreibung lesen: nur gültige IDs, Duplikate und Müll fallen heraus', () => {
  const a = '00000000-0000-4000-8000-000000000001'
  assert.deepEqual(leseUeberschreibung({ aus: [a, a, 'x', 5], ein: 'nope' }), { aus: [a], ein: [] })
  assert.deepEqual(leseUeberschreibung(null), { aus: [], ein: [] })
})
