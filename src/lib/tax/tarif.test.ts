import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  type Tarif,
  estFuerZvE,
  grenzsteuersatz,
  kirchensteuer,
  satzAufNaechste,
  solidaritaetszuschlag,
  zone,
} from './tarif.ts'

/**
 * Sollwerte fuer diese Tests sind von Hand aus der Gesetzesformel gerechnet,
 * nicht aus dem Code uebernommen -- sonst pruefte der Test nur, dass der Code
 * tut, was er tut. Die Zwischenschritte stehen jeweils als Kommentar dabei,
 * damit sie nachrechenbar sind.
 *
 * Laufen mit: npm test
 */

/** Tarif 2026, identisch mit dem Seed in 20260906140000_tax_engine.sql. */
const T2026: Tarif = {
  jahr: 2026,
  grundfreibetrag: 12_348,
  zone2_bis: 17_799,
  zone2_faktor: 914.51,
  zone2_konstante: 1400,
  zone3_bis: 69_878,
  zone3_faktor: 173.1,
  zone3_konstante: 2397,
  zone3_sockel: 1034.87,
  zone4_bis: 277_825,
  zone4_satz: 0.42,
  zone4_abzug: 11_135.63,
  zone5_satz: 0.45,
  zone5_abzug: 19_470.38,
  werbungskostenpauschale: 1230,
  sonderausgabenpauschale: 36,
  soli_freigrenze: null,
  kleinunternehmer_vorjahr: 25_000,
  kleinunternehmer_laufend: 100_000,
  quelle: 'Test',
  geprueft_am: '2026-09-06',
}

test('Nullzone: bis zum Grundfreibetrag faellt keine Steuer an', () => {
  assert.equal(estFuerZvE(0, T2026), 0)
  assert.equal(estFuerZvE(12_347, T2026), 0)
  assert.equal(estFuerZvE(12_348, T2026), 0)
})

test('erster Euro ueber dem Grundfreibetrag: Steuer rundet auf 0 ab', () => {
  // y = 1/10000; (914,51 * 0,0001 + 1400) * 0,0001 = 0,14000091 -> abgerundet 0
  assert.equal(estFuerZvE(12_349, T2026), 0)
})

test('Zone 2 am oberen Rand: 17.799 EUR', () => {
  // y = (17799 - 12348)/10000 = 0,5451
  // (914,51 * 0,5451 + 1400) * 0,5451 = (498,4994 + 1400) * 0,5451 = 1034,872...
  assert.equal(estFuerZvE(17_799, T2026), 1034)
})

test('Zonenwechsel 2 -> 3 ist stetig', () => {
  // Der Sockel 1.034,87 entspricht genau dem Wert, den Zone 2 bei 17.799
  // liefert. Zone 3 bei 17.800: z = 0,0001 -> 0,2397 + 1034,87 = 1035,11
  assert.equal(estFuerZvE(17_800, T2026), 1035)
})

test('Zone 3 am oberen Rand und Zonenwechsel 3 -> 4 ist stetig', () => {
  // z = (69878 - 17799)/10000 = 5,2079
  // (173,10 * 5,2079 + 2397) * 5,2079 + 1034,87 = 17178,193 + 1034,87 = 18213,06
  assert.equal(estFuerZvE(69_878, T2026), 18_213)
  // Zone 4 bei 69.879: 0,42 * 69879 - 11135,63 = 18213,55
  assert.equal(estFuerZvE(69_879, T2026), 18_213)
})

test('Zone 4: linear mit 42 Prozent', () => {
  // 0,42 * 70000 - 11135,63 = 18264,37
  assert.equal(estFuerZvE(70_000, T2026), 18_264)
})

test('Zone 5: linear mit 45 Prozent', () => {
  // 0,45 * 300000 - 19470,38 = 115529,62
  assert.equal(estFuerZvE(300_000, T2026), 115_529)
})

test('zu versteuerndes Einkommen wird auf volle Euro abgerundet', () => {
  assert.equal(estFuerZvE(70_000.99, T2026), estFuerZvE(70_000, T2026))
})

test('negatives zu versteuerndes Einkommen ergibt keine Steuer', () => {
  assert.equal(estFuerZvE(-5000, T2026), 0)
})

test('Grenzsteuersatz: 0 Prozent unter dem Grundfreibetrag', () => {
  assert.equal(grenzsteuersatz(10_000, T2026), 0)
})

test('Grenzsteuersatz: Eingangssteuersatz knapp ueber dem Grundfreibetrag', () => {
  // Ableitung in Zone 2: (2 * 914,51 * y + 1400) / 10000, y ~ 0
  // -> 1400/10000 = 0,14 = 14 Prozent
  assert.ok(Math.abs(grenzsteuersatz(12_349, T2026) - 14.0) < 0.01)
})

test('Grenzsteuersatz: 42 Prozent in der Proportionalzone', () => {
  assert.ok(Math.abs(grenzsteuersatz(100_000, T2026) - 42) < 0.0001)
})

test('Grenzsteuersatz: 45 Prozent in der Reichensteuerzone', () => {
  assert.ok(Math.abs(grenzsteuersatz(300_000, T2026) - 45) < 0.0001)
})

test('Grenzsteuersatz mitten in Zone 3', () => {
  // Ableitung: (2 * 173,10 * z + 2397)/10000 mit z = (45184 - 17799)/10000 = 2,7385
  // = (948,0687 + 2397)/10000 = 0,33450687 -> 33,45 Prozent
  assert.ok(Math.abs(grenzsteuersatz(45_184, T2026) - 33.4507) < 0.01)
})

test('Grenzsteuersatz wird nicht aus abgerundeten Betraegen gebildet', () => {
  // Der Kern des Problems, wegen dem estRoh existiert: aus auf Euro
  // abgerundeten Steuerbetraegen waere die Steigung ueber einen Euro je nach
  // Startpunkt 0 oder 100 Prozent. Ueber zehn aufeinanderfolgende Euro darf
  // sich der Satz praktisch nicht bewegen.
  const saetze = Array.from({ length: 10 }, (_, i) => grenzsteuersatz(45_184 + i, T2026))
  for (const satz of saetze) {
    assert.ok(Math.abs(satz - saetze[0]) < 0.01, `Satz sprang: ${satz} vs ${saetze[0]}`)
  }
})

test('Satz auf die naechsten 1.000 EUR liegt zwischen den Grenzsaetzen', () => {
  // Ueber eine Zonengrenze hinweg: 17.500 liegt in Zone 2, 18.500 in Zone 3.
  const unten = grenzsteuersatz(17_500, T2026)
  const oben  = grenzsteuersatz(18_500, T2026)
  const ueber1000 = satzAufNaechste(17_500, 1000, T2026)
  assert.ok(ueber1000 > unten && ueber1000 < oben,
    `${ueber1000} sollte zwischen ${unten} und ${oben} liegen`)
})

test('Satz auf die naechsten 1.000 EUR in Zone 3', () => {
  // (estRoh(46184) - estRoh(45184)) / 1000 = (9233,435 - 8897,198)/1000
  assert.ok(Math.abs(satzAufNaechste(45_184, 1000, T2026) - 33.6237) < 0.01)
})

test('Satz auf 0 EUR ist 0 und dividiert nicht durch null', () => {
  assert.equal(satzAufNaechste(45_184, 0, T2026), 0)
})

test('Kirchensteuer', () => {
  assert.equal(kirchensteuer(8897, 8), 711.76)
  assert.equal(kirchensteuer(8897, 0), 0)
})

test('Soli ohne hinterlegte Freigrenze: 0, und unsicher nur wenn es zaehlen koennte', () => {
  assert.deepEqual(solidaritaetszuschlag(8897, T2026), { betrag: 0, unsicher: false })
  assert.deepEqual(solidaritaetszuschlag(40_000, T2026), { betrag: 0, unsicher: true })
})

test('Soli mit Freigrenze: Milderungszone und Vollsatz', () => {
  const mitFreigrenze: Tarif = { ...T2026, soli_freigrenze: 20_000 }
  // Unter der Freigrenze: nichts.
  assert.equal(solidaritaetszuschlag(20_000, mitFreigrenze).betrag, 0)
  // Knapp darueber greift die 11,9-Prozent-Kappung: 0,119 * 1000 = 119
  // gegenueber 0,055 * 21000 = 1155 -> die Kappung gewinnt.
  assert.equal(solidaritaetszuschlag(21_000, mitFreigrenze).betrag, 119)
  // Weit darueber gewinnen die 5,5 Prozent: 0,055 * 60000 = 3300
  // gegenueber 0,119 * 40000 = 4760.
  assert.equal(solidaritaetszuschlag(60_000, mitFreigrenze).betrag, 3300)
})

test('Zonenzuordnung', () => {
  assert.equal(zone(12_348, T2026), 1)
  assert.equal(zone(12_349, T2026), 2)
  assert.equal(zone(17_799, T2026), 2)
  assert.equal(zone(17_800, T2026), 3)
  assert.equal(zone(69_878, T2026), 3)
  assert.equal(zone(69_879, T2026), 4)
  assert.equal(zone(277_825, T2026), 4)
  assert.equal(zone(277_826, T2026), 5)
})
