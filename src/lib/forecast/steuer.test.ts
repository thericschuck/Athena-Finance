import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Tarif } from '../tax/tarif.ts'
import type { SteuerEingaben, Steuerprofil } from '../tax/position.ts'
import { berechneSteuerPrognose, type SteuerPrognoseEingaben } from './steuer.ts'
import type { Annahme } from './annahmen.ts'

const T2026: Tarif = {
  jahr: 2026,
  grundfreibetrag: 12_348,
  zone2_bis: 17_799, zone2_faktor: 914.51, zone2_konstante: 1400,
  zone3_bis: 69_878, zone3_faktor: 173.1, zone3_konstante: 2397, zone3_sockel: 1034.87,
  zone4_bis: 277_825, zone4_satz: 0.42, zone4_abzug: 11_135.63,
  zone5_satz: 0.45, zone5_abzug: 19_470.38,
  werbungskostenpauschale: 1230,
  sonderausgabenpauschale: 36,
  soli_freigrenze: null,
  kleinunternehmer_vorjahr: 25_000,
  kleinunternehmer_laufend: 100_000,
  quelle: 'Test',
  geprueft_am: '2026-09-06',
}

const PROFIL: Steuerprofil = {
  bruttoJahreslohn: null, bruttoStand: null, vorsorgeAnteilPct: 19, kirchensteuerPct: 0, nettoQuote: 0.75,
}

const IST: SteuerEingaben = {
  jahr: 2026, tarif: T2026, betriebseinnahmen: 0, betriebsausgaben: 0, lohnNettoImJahr: 0, monateMitLohn: 0,
  profil: PROFIL, umsatzVorjahr: 0, ruecklageIst: null, unzugeordnet: [],
}

const lohn = (von: string, netto: number, brutto: number | null): Annahme =>
  ({ id: 'l', label: 'Gehalt', art: 'lohn', von, bis: null, betrag: netto, brutto })

function eingaben(o: Partial<SteuerPrognoseEingaben> = {}): SteuerPrognoseEingaben {
  return {
    jahr: 2027, heute: '2026-10-21', istStand: { ...IST, jahr: 2027 },
    laufrate: { betriebseinnahmen: 1000, betriebsausgaben: 200, lohnNetto: 500 }, annahmen: [], ...o,
  }
}

test('Künftiges Jahr: zwölf Monate Laufrate, Basis und Szenario sind ohne Annahmen gleich', () => {
  const p = berechneSteuerPrognose(eingaben())
  assert.equal(p.basis.hochrechnung.betriebseinnahmen, 12_000)
  assert.equal(p.basis.hochrechnung.betriebsausgaben, 2_400)
  assert.equal(p.basis.hochrechnung.gewinn, 9_600)
  assert.equal(p.basis.hochrechnung.lohnNetto, 6_000)
  assert.equal(p.mehrsteuer, 0)
  assert.deepEqual(p.basis.hochrechnung, p.szenario.hochrechnung)
  assert.ok(p.hinweise.some(h => /keine Annahmen/.test(h)))
})

test('Laufendes Jahr: Ist-Stand plus Restanteil des Monats plus volle Folgemonate', () => {
  // 21.10.: Oktober hat 31 Tage, 10 davon sind offen; dazu November und Dezember.
  const p = berechneSteuerPrognose(eingaben({
    jahr: 2026, heute: '2026-10-21',
    istStand: { ...IST, jahr: 2026, betriebseinnahmen: 9_000, betriebsausgaben: 1_000, lohnNettoImJahr: 4_000, monateMitLohn: 10 },
  }))
  const rest = (10 / 31) + 2
  assert.equal(p.basis.hochrechnung.betriebseinnahmen, Math.round((9_000 + 1_000 * rest) * 100) / 100)
  assert.equal(p.basis.hochrechnung.lohnNetto, Math.round((4_000 + 500 * rest) * 100) / 100)
})

test('Lohn-Annahme ersetzt das Lohnniveau ab dem Monat, nicht davor', () => {
  const p = berechneSteuerPrognose(eingaben({ annahmen: [lohn('2027-07', 2_000, 2_800)] }))
  // Januar–Juni 6 × 500, Juli–Dezember 6 × 2000
  assert.equal(p.szenario.hochrechnung.lohnNetto, 6 * 500 + 6 * 2_000)
  assert.equal(p.basis.hochrechnung.lohnNetto, 6_000)
})

test('Brutto kommt aus der Annahme, sobald eine angegeben ist', () => {
  const p = berechneSteuerPrognose(eingaben({ annahmen: [lohn('2027-01', 2_000, 2_800)] }))
  assert.equal(p.szenario.hochrechnung.lohnBrutto, 12 * 2_800)
  assert.equal(p.szenario.position.lohn.brutto, 12 * 2_800)
  assert.equal(p.szenario.position.lohn.quelle, 'gerechnet')
})

test('Ohne Brutto-Angabe schätzt die Engine aus dem Netto, wie auf der Steuerseite', () => {
  const p = berechneSteuerPrognose(eingaben({ annahmen: [lohn('2027-01', 2_000, null)] }))
  assert.equal(p.szenario.hochrechnung.lohnBrutto, null)
  assert.equal(p.szenario.position.lohn.quelle, 'geschaetzt')
  assert.equal(p.szenario.position.lohn.brutto, Math.round((24_000 / 0.75) * 100) / 100)
})

test('Höheres Gehalt erhöht die Gesamtsteuer; Mehrsteuer = Differenz der beiden Rechnungen', () => {
  const p = berechneSteuerPrognose(eingaben({ annahmen: [lohn('2027-01', 3_000, 4_200)] }))
  assert.ok(p.mehrsteuer > 0)
  assert.equal(
    p.mehrsteuer,
    Math.round((p.szenario.position.steuer.gesamt - p.basis.position.steuer.gesamt) * 100) / 100,
  )
})

test('Zusätzliche Betriebseinnahmen erhöhen Gewinn und Kleinunternehmer-Umsatz', () => {
  const as: Annahme[] = [{ id: 'b', label: 'Bauprojekt', art: 'betriebseinnahme', von: '2027-03', bis: '2027-05', betrag: 4_000, brutto: null }]
  const p = berechneSteuerPrognose(eingaben({ annahmen: as }))
  assert.equal(p.szenario.hochrechnung.betriebseinnahmen, 12_000 + 3 * 4_000)
  assert.equal(p.szenario.position.kleinunternehmer.umsatz_laufend, 24_000)
})

test('Rücklage: Lücke wird auf die Monate bis Jahresende verteilt', () => {
  const p = berechneSteuerPrognose(eingaben({
    jahr: 2026, heute: '2026-10-21',
    istStand: { ...IST, jahr: 2026, ruecklageIst: 0, betriebseinnahmen: 40_000 },
    laufrate: { betriebseinnahmen: 0, betriebsausgaben: 0, lohnNetto: 0 },
  }))
  assert.equal(p.ruecklage.monateBisJahresende, 3)   // Okt, Nov, Dez
  assert.ok(p.ruecklage.luecke !== null && p.ruecklage.luecke > 0)
  assert.equal(p.ruecklage.proMonat, Math.round((p.ruecklage.luecke! / 3) * 100) / 100)
})

test('Ohne Rücklage-Ziel gibt es keine Monatsrate', () => {
  const p = berechneSteuerPrognose(eingaben())
  assert.equal(p.ruecklage.ist, null)
  assert.equal(p.ruecklage.proMonat, null)
})

test('Vergangene Monate zählen nicht doppelt: Annahmen vor heute ändern das laufende Jahr nicht', () => {
  const alt = berechneSteuerPrognose(eingaben({
    jahr: 2026, heute: '2026-10-21', istStand: { ...IST, jahr: 2026, lohnNettoImJahr: 5_000, monateMitLohn: 10 },
    annahmen: [lohn('2026-01', 9_999, null)],
  }))
  const ohne = berechneSteuerPrognose(eingaben({
    jahr: 2026, heute: '2026-10-21', istStand: { ...IST, jahr: 2026, lohnNettoImJahr: 5_000, monateMitLohn: 10 },
  }))
  // Die Annahme gilt rückwirkend ab Januar, wirkt aber nur auf die offenen Monate (Rest Oktober, Nov, Dez).
  const rest = 10 / 31 + 2
  assert.equal(alt.szenario.hochrechnung.lohnNetto, Math.round((5_000 + 9_999 * rest) * 100) / 100)
  assert.equal(ohne.szenario.hochrechnung.lohnNetto, Math.round((5_000 + 500 * rest) * 100) / 100)
})

import { laufrateAus } from './steuer.ts'

test('Laufrate: ab drei Monaten trägt der Ist-Stand des laufenden Jahres', () => {
  const { rate, quelle } = laufrateAus(
    { ...IST, jahr: 2026, betriebseinnahmen: 9_000, betriebsausgaben: 900, lohnNettoImJahr: 4_000, monateMitLohn: 8 },
    { betriebseinnahmen: 1, betriebsausgaben: 1, lohnNetto: 1 },
    '2026-09-30',
  )
  assert.equal(rate.betriebseinnahmen, 1_000)   // 9000 / 9 verstrichene Monate (Jan–Sep)
  assert.equal(rate.betriebsausgaben, 100)
  assert.equal(rate.lohnNetto, 500)             // 4000 / 8 Monate mit Lohn
  assert.match(quelle, /2026/)
})

test('Laufrate: im Januar zählt das Vorjahr durch zwölf, ohne Vorjahr der dünne Ist-Stand', () => {
  const ist = { ...IST, jahr: 2027, betriebseinnahmen: 100 }
  const mit = laufrateAus(ist, { betriebseinnahmen: 12_000, betriebsausgaben: 1_200, lohnNetto: 6_000 }, '2027-01-10')
  assert.deepEqual(mit.rate, { betriebseinnahmen: 1_000, betriebsausgaben: 100, lohnNetto: 500 })
  const ohne = laufrateAus(ist, null, '2027-01-10')
  assert.ok(ohne.rate.betriebseinnahmen > 0)
})
