import { test } from 'node:test'
import assert from 'node:assert/strict'
import { proMonat, vertragsEntwurf, vertragsName, vertragsTyp } from './vertragsvorschlag.ts'

const k = (o: Record<string, unknown> = {}) => ({
  bezeichnung: 'Vercel Inc', kategorie_name: 'Vercel', kategorie_wurzel: 'Abo', frequenz: 'monthly' as const, betrag: 21.61,
  tag_im_monat: 5, erste_buchung: '2026-06-05', konto_id: 'a', kategorie_id: 'c', betrag_variabel: true, betrag_min: 21.3, betrag_max: 43.22, anzahl: 5, ...o,
})

test('Name: Abo-Unterkategorie mit Anbieternamen schlägt den Beleg-Text, Sammelkategorien nicht', () => {
  assert.equal(vertragsName(k()), 'Vercel')
  assert.equal(vertragsName(k({ kategorie_name: 'Claude / Anthropic', bezeichnung: 'Anthropic: Claude Team' })), 'Claude / Anthropic')
  assert.equal(vertragsName(k({ kategorie_name: 'Sonstige Abos' })), 'Vercel Inc')
  assert.equal(vertragsName(k({ kategorie_name: 'Abo' })), 'Vercel Inc')
  assert.equal(vertragsName(k({ kategorie_wurzel: 'Business', kategorie_name: 'Tools' })), 'Vercel Inc')
  assert.equal(vertragsName(k({ kategorie_wurzel: null, kategorie_name: null })), 'Vercel Inc')
})

test('Typ: Bausparen, Versicherung, Miete, Versorger werden erkannt, sonst Abonnement', () => {
  assert.equal(vertragsTyp(k({ bezeichnung: 'Bausparkasse Schwäbisch Hall AG', kategorie_name: '20.000 €', kategorie_wurzel: 'Bausparverträge' })), 'building_savings')
  assert.equal(vertragsTyp(k({ bezeichnung: 'Allianz Versicherung' })), 'insurance')
  assert.equal(vertragsTyp(k({ bezeichnung: 'Wohnung Miete Oktober' })), 'rental')
  assert.equal(vertragsTyp(k({ bezeichnung: 'SP KERNENERGIE GMBH' })), 'utility')
  assert.equal(vertragsTyp(k()), 'subscription')
})

test('Entwurf: Intervall, Abbuchungstag, Konto, Kategorie und der Hinweis bei nutzungsabhängigen Abos', () => {
  const e = vertragsEntwurf(k())
  assert.deepEqual(
    { name: e.name, type: e.type, frequency: e.frequency, amount: e.amount, billing_day: e.billing_day, start_date: e.start_date, account_id: e.account_id, category_id: e.category_id },
    { name: 'Vercel', type: 'subscription', frequency: 'monthly', amount: 21.61, billing_day: 5, start_date: '2026-06-05', account_id: 'a', category_id: 'c' },
  )
  assert.match(e.notes, /5 Buchungen erkannt/)
  assert.match(e.notes, /zwischen 21 und 43 €/)
  assert.doesNotMatch(vertragsEntwurf(k({ betrag_variabel: false })).notes, /Nutzungsabhängig/)
})

test('Pro Monat: Intervalle vergleichbar machen', () => {
  assert.equal(proMonat(120, 'yearly'), 10)
  assert.equal(proMonat(30, 'quarterly'), 10)
  assert.equal(proMonat(10, 'monthly'), 10)
  assert.ok(Math.abs(proMonat(10, 'weekly') - 43.33) < 0.01)
})
