import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLearnedCategoryMap, lernSchluessel, suggestCategory } from './categorize.ts'
import type { FinanceCategory } from '@/types/bank'

const cat = (id: string, name = id): FinanceCategory => ({ id, name, type: 'expense', color: null, icon: null, parent_id: null })
const CATS = [cat('essen', 'Essen auswärts'), cat('reisen', 'Reisen'), cat('claude', 'Claude / Anthropic'), cat('tools', 'Tools'),
  cat('shopping', 'Shopping'), cat('auszahlung', 'Auszahlung'), cat('einzahlung', 'Einzahlung'), cat('prime', 'Amazon Prime'),
  cat('freizeit', 'Freizeit'), cat('depot', 'Depot'), cat('kap', 'Kapitalerträge')]

const karte = (haendler: string, ort = 'CHAOYANG') => `Alipay.${haendler}/${ort}/CN 15.10.2026 / 12:31 OrtszeitPHYS Zahlung 12,00 CNY`

test('Abwickler: eine Gegenpartei mit Kategorien-Wirrwarr wird nicht gelernt (DZ BANK -> Claude)', () => {
  const rows = [
    ...Array.from({ length: 6 }, () => ({ counterpart_name: 'DZ BANK AG', category_id: 'claude', description: 'Claude.ai Subscription' })),
    { counterpart_name: 'DZ BANK AG', category_id: 'essen', description: 'Restaurant Mueller' },
    { counterpart_name: 'DZ BANK AG', category_id: 'reisen', description: 'Hotel Adler' },
    { counterpart_name: 'DZ BANK AG', category_id: 'tools', description: 'Vercel Inc' },
    { counterpart_name: 'DZ BANK AG', category_id: 'freizeit', description: 'Kino' },
    { counterpart_name: 'DZ BANK AG', category_id: 'shopping', description: 'Zalando' },
    { counterpart_name: 'DZ BANK AG', category_id: 'depot', description: 'Sparplan' },
    { counterpart_name: 'DZ BANK AG', category_id: 'prime', description: 'Prime' },
    { counterpart_name: 'DZ BANK AG', category_id: 'auszahlung', description: 'Bargeld' },
  ]
  const map = buildLearnedCategoryMap(rows)
  assert.equal(map.has('dz bank ag'), false)
  // Eine unbekannte Kartenzahlung bekommt deshalb nicht mehr "Claude".
  assert.equal(suggestCategory('DZ BANK AG', karte('Starbucks'), CATS, map, -5.7), null)
})

test('Händler aus dem Verwendungszweck: einmal entschieden, gilt für jede weitere Kartenzahlung dort', () => {
  const map = buildLearnedCategoryMap([
    { counterpart_name: 'DZ BANK AG', category_id: 'essen', description: karte('Starbucks'), amount: -4.2 },
    { counterpart_name: 'DZ BANK AG', category_id: 'reisen', description: karte('DIDI TAXI'), amount: -1.8 },
  ])
  assert.equal(suggestCategory('DZ BANK AG', karte('Starbucks', 'SHANGHAI'), CATS, map, -5.7)?.id, 'essen')
  assert.equal(suggestCategory('DZ BANK AG', karte('DIDI TAXI'), CATS, map, -2.1)?.id, 'reisen')
  assert.equal(suggestCategory('DZ BANK AG', karte('Unbekannt Laden'), CATS, map, -2.1), null)
})

test('Richtung trennt Einzahlung von Auszahlung beim selben Institut', () => {
  const map = buildLearnedCategoryMap([
    { counterpart_name: 'FRANKFURTER VOBA', category_id: 'einzahlung', description: 'Einzahlung', amount: 500 },
    { counterpart_name: 'FRANKFURTER VOBA', category_id: 'einzahlung', description: 'Einzahlung', amount: 300 },
    { counterpart_name: 'FRANKFURTER VOBA', category_id: 'auszahlung', description: 'Auszahlung', amount: -200 },
    { counterpart_name: 'FRANKFURTER VOBA', category_id: 'auszahlung', description: 'Auszahlung', amount: -100 },
    { counterpart_name: 'FRANKFURTER VOBA', category_id: 'auszahlung', description: 'Auszahlung', amount: -50 },
  ])
  assert.equal(suggestCategory('FRANKFURTER VOBA', 'Bar', CATS, map, 120)?.id, 'einzahlung')
  assert.equal(suggestCategory('FRANKFURTER VOBA', 'Bar', CATS, map, -80)?.id, 'auszahlung')
})

test('Fester Betrag: Abo-Preis schlägt Gegenpartei-Mehrheit, aber nur bei mindestens zwei einheitlichen Treffern', () => {
  const rows = [
    ...[1, 2, 3, 4].map(() => ({ counterpart_name: 'AMAZON EU', category_id: 'freizeit', amount: -23.4, description: 'Bestellung' })),
    { counterpart_name: 'AMAZON EU', category_id: 'prime', amount: -8.99, description: 'Prime' },
    { counterpart_name: 'AMAZON EU', category_id: 'prime', amount: -8.99, description: 'Prime' },
  ]
  const map = buildLearnedCategoryMap(rows)
  assert.equal(suggestCategory('AMAZON EU', 'Prime', CATS, map, -8.99)?.id, 'prime')
  assert.equal(suggestCategory('AMAZON EU', 'irgendwas', CATS, map, -50)?.id, 'freizeit')

  const einmal = buildLearnedCategoryMap([
    { counterpart_name: 'X', category_id: 'prime', amount: -8.99 }, { counterpart_name: 'X', category_id: 'freizeit', amount: -1 },
    { counterpart_name: 'X', category_id: 'freizeit', amount: -2 },
  ])
  assert.equal(suggestCategory('X', null, CATS, einmal, -8.99)?.id, 'freizeit') // ein einzelner Betrag zählt nicht
})

test('Regeln feuern nicht auf den Namen eines Zahlungsabwicklers', () => {
  // Früher: "paypal" stand in der Shopping-Regel, jede PayPal-Zahlung wurde zum Einkauf.
  assert.equal(suggestCategory('PayPal Europe S.a.r.l. et Cie', '105/PP.8546.PP/. , Ihr Einkauf bei EREF: 105', CATS), null)
  // Der Händler im Verwendungszweck darf eine Regel auslösen.
  assert.equal(suggestCategory('PayPal Europe S.a.r.l.', '105/PP.1.PP/. Anthropic, Ihr Einkauf bei Anthropic PBC EREF: 105', CATS)?.id, 'claude')
})

test('Dividende ist eine Einnahme (Kapitalerträge), nicht Depot; ohne diese Kategorie bleibt es beim Depot', () => {
  assert.equal(suggestCategory('Frankfurter Volksbank', 'GESCH.ANTEILKTO 6 % Dividende für Jahr 2025', CATS)?.id, 'kap')
  assert.equal(suggestCategory('Frankfurter Volksbank', 'GESCH.ANTEILKTO 6 % Dividende für Jahr 2025', CATS.filter(c => c.id !== 'kap'))?.id, 'depot')
})

test('Lernschlüssel: Händler vor Gegenpartei, sonst normalisierte Gegenpartei', () => {
  assert.equal(lernSchluessel('DZ BANK AG', karte('Starbucks')), 'h:alipay starbucks')
  assert.equal(lernSchluessel('  REWE   Markt ', 'Kartenzahlung'), 'rewe markt')
  assert.equal(lernSchluessel(null, null), null)
})
