import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Tarif } from './tarif.ts'
import { berechneSteuerposition, type SteuerEingaben, type Steuerprofil } from './position.ts'

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
  bruttoJahreslohn: null,
  bruttoStand: null,
  vorsorgeAnteilPct: 19,
  kirchensteuerPct: 0,
  nettoQuote: 0.75,
}

const EINGABEN: SteuerEingaben = {
  jahr: 2026,
  tarif: T2026,
  betriebseinnahmen: 0,
  betriebsausgaben: 0,
  lohnNettoImJahr: 0,
  monateMitLohn: 0,
  profil: PROFIL,
  umsatzVorjahr: 0,
  ruecklageIst: null,
  unzugeordnet: [],
}

test('Erics Lage 2026: unter dem Grundfreibetrag, also 0 Prozent auf den naechsten Euro', () => {
  const p = berechneSteuerposition({
    ...EINGABEN,
    betriebseinnahmen: 2937.5,
    betriebsausgaben: 3570,      // das Coaching unter "Weiterbildung"
    lohnNettoImJahr: 6000,
    monateMitLohn: 12,
  })

  // Der Gewinn ist negativ -- die Weiterbildung uebersteigt die Einnahmen.
  assert.equal(p.betrieb.gewinn, -632.5)
  // Brutto geschaetzt: 6000/12*12 = 6000, geteilt durch 0,75 = 8000
  assert.equal(p.lohn.brutto, 8000)
  assert.equal(p.lohn.quelle, 'geschaetzt')
  // 8000 - 1230 - 1520 (19 %) - 632,50 - 36 = 4581,50
  assert.equal(p.zve.betrag, 4581.5)
  assert.equal(p.zve.zone, 1)
  assert.equal(p.steuer.einkommensteuer, 0)
  assert.equal(p.grenzsteuersatz.naechster_euro_pct, 0)
  assert.equal(p.grenzsteuersatz.von_1000_bleiben, 1000)
  // Ein Verlust kostet keine Steuer -- und erzeugt hier auch keine Gutschrift.
  assert.equal(p.gewinn_kostet.steuer, 0)
  assert.ok(p.warnungen.some(w => w.includes('Bruttolohn ist geschaetzt')))
})

test('2027 mit Vollzeitgehalt: der Sprung, um den es geht', () => {
  const p = berechneSteuerposition({
    ...EINGABEN,
    betriebseinnahmen: 12_000,
    betriebsausgaben: 2000,
    profil: { ...PROFIL, bruttoJahreslohn: 45_000, bruttoStand: '2026-09-06' },
  })

  assert.equal(p.betrieb.gewinn, 10_000)
  assert.equal(p.lohn.quelle, 'gerechnet')
  // 45000 - 1230 - 8550 (19 %) + 10000 - 36 = 45184
  assert.equal(p.zve.betrag, 45_184)
  assert.equal(p.zve.zone, 3)
  assert.equal(p.steuer.einkommensteuer, 8897)
  assert.ok(Math.abs(p.grenzsteuersatz.naechster_euro_pct - 33.45) < 0.01)
  // (estRoh(46184) - estRoh(45184)) / 1000 = 33,6237 Prozent
  assert.ok(Math.abs(p.grenzsteuersatz.naechste_1000_pct - 33.62) < 0.01)
  assert.ok(Math.abs(p.grenzsteuersatz.von_1000_bleiben - 663.76) < 0.5)
  // Steuer MIT dem Gewinn minus Steuer OHNE: 8897,198 - 5725,229
  assert.ok(Math.abs(p.gewinn_kostet.steuer - 3171.97) < 0.5)
})

test('der Gewinn kostet nicht Gewinn mal Grenzsteuersatz', () => {
  // Ein Gewinn, der ueber eine Zonengrenze reicht: 10.000 EUR bei einem zvE,
  // das ohne ihn noch in Zone 2 laege. Der tatsaechliche Kostenbetrag muss
  // unter der naiven Rechnung liegen.
  const p = berechneSteuerposition({
    ...EINGABEN,
    betriebseinnahmen: 10_000,
    profil: { ...PROFIL, bruttoJahreslohn: 20_000, bruttoStand: '2026-09-06' },
  })
  const naiv = p.betrieb.gewinn * (p.grenzsteuersatz.naechster_euro_pct / 100)
  assert.ok(p.gewinn_kostet.steuer < naiv,
    `${p.gewinn_kostet.steuer} muss unter der naiven Rechnung ${naiv} liegen`)
})

test('Kirchensteuer hebt den effektiven Grenzsteuersatz an', () => {
  const ohne = berechneSteuerposition({
    ...EINGABEN,
    betriebseinnahmen: 12_000, betriebsausgaben: 2000,
    profil: { ...PROFIL, bruttoJahreslohn: 45_000, bruttoStand: '2026-09-06' },
  })
  const mit = berechneSteuerposition({
    ...EINGABEN,
    betriebseinnahmen: 12_000, betriebsausgaben: 2000,
    profil: { ...PROFIL, bruttoJahreslohn: 45_000, bruttoStand: '2026-09-06', kirchensteuerPct: 8 },
  })
  assert.equal(mit.steuer.kirchensteuer, 711.76)   // 8 Prozent von 8897
  assert.ok(Math.abs(mit.grenzsteuersatz.naechster_euro_pct - ohne.grenzsteuersatz.naechster_euro_pct * 1.08) < 0.02)
  assert.ok(mit.grenzsteuersatz.von_1000_bleiben < ohne.grenzsteuersatz.von_1000_bleiben)
})

test('fehlendes Tarifjahr: rechnen und sagen, womit', () => {
  const p = berechneSteuerposition({ ...EINGABEN, jahr: 2027 })
  assert.equal(p.tarif.jahr, 2026)
  assert.ok(p.tarif.hinweis?.includes('2027'))
  assert.ok(p.warnungen.some(w => w.includes('Tarif 2026')))
})

test('passendes Tarifjahr: kein Hinweis', () => {
  const p = berechneSteuerposition(EINGABEN)
  assert.equal(p.tarif.hinweis, null)
  assert.equal(p.warnungen.length, 0)
})

test('Kleinunternehmer-Ampel', () => {
  const gruen = berechneSteuerposition({ ...EINGABEN, betriebseinnahmen: 2937.5, umsatzVorjahr: 1200 })
  assert.equal(gruen.kleinunternehmer.status, 'gruen')
  assert.equal(gruen.kleinunternehmer.abstand_laufend, 97_062.5)

  // Vorjahr ueber 80 Prozent der 25.000er-Grenze -> gelb, aber noch drin.
  const gelb = berechneSteuerposition({ ...EINGABEN, betriebseinnahmen: 5000, umsatzVorjahr: 21_000 })
  assert.equal(gelb.kleinunternehmer.status, 'gelb')

  // Vorjahr ueber 25.000 -> die Kleinunternehmerregel greift nicht mehr.
  const rot = berechneSteuerposition({ ...EINGABEN, betriebseinnahmen: 5000, umsatzVorjahr: 30_000 })
  assert.equal(rot.kleinunternehmer.status, 'rot')
  assert.ok(rot.warnungen.some(w => w.includes('Umsatzsteuer')))

  const unbekannt = berechneSteuerposition({ ...EINGABEN, umsatzVorjahr: null })
  assert.equal(unbekannt.kleinunternehmer.status, 'unbekannt')
})

test('Ruecklage: Soll, Ist und Luecke', () => {
  const basis = {
    ...EINGABEN,
    betriebseinnahmen: 12_000, betriebsausgaben: 2000,
    profil: { ...PROFIL, bruttoJahreslohn: 45_000, bruttoStand: '2026-09-06' },
  }
  const ohneZiel = berechneSteuerposition(basis)
  assert.equal(ohneZiel.ruecklage.ist, null)
  assert.equal(ohneZiel.ruecklage.luecke, null)
  assert.ok(ohneZiel.warnungen.some(w => w.includes('kein Ruecklage-Sparziel')))

  const mitZiel = berechneSteuerposition({ ...basis, ruecklageIst: 1240 })
  assert.ok(Math.abs(mitZiel.ruecklage.luecke! - (mitZiel.ruecklage.soll - 1240)) < 0.01)

  // Genug zurueckgelegt: keine Luecke, kein negativer Wert.
  const uebererfuellt = berechneSteuerposition({ ...basis, ruecklageIst: 99_999 })
  assert.equal(uebererfuellt.ruecklage.luecke, 0)
})

test('nicht zugeordnete Einnahmen fallen nicht still raus', () => {
  const p = berechneSteuerposition({
    ...EINGABEN,
    betriebseinnahmen: 2937.5,
    unzugeordnet: [{ kategorie: 'Gehalt', betrag: 322.59 }, { kategorie: 'Sonstiges', betrag: 100 }],
  })
  assert.equal(p.unzugeordnet.length, 2)
  assert.ok(p.warnungen.some(w => w.includes('422.59') && w.includes('NICHT enthalten')))
})

test('veralteter Bruttolohn wird gemeldet', () => {
  const p = berechneSteuerposition({
    ...EINGABEN,
    profil: { ...PROFIL, bruttoJahreslohn: 45_000, bruttoStand: '2024-01-01' },
  })
  assert.ok(p.warnungen.some(w => w.includes('aelter als ein Jahr')))
})

test('ohne jede Lohnbuchung wird kein Brutto erfunden', () => {
  const p = berechneSteuerposition({ ...EINGABEN, betriebseinnahmen: 5000 })
  assert.equal(p.lohn.brutto, 0)
  // Ohne Lohn gibt es auch keine Werbungskostenpauschale.
  assert.equal(p.zve.abzuege.werbungskosten, 0)
  // 0 - 0 - 0 + 5000 - 36 = 4964
  assert.equal(p.zve.betrag, 4964)
})

test('Krypto-Gewinne: ohne Angabe nichts, mit Angabe im Einkommen und in der Ruecklage, ohne Doppelzaehlung', () => {
  const basis = { ...EINGABEN, betriebseinnahmen: 30_000, betriebsausgaben: 5000, lohnNettoImJahr: 24_000, monateMitLohn: 12 }
  const ohne = berechneSteuerposition(basis)
  assert.deepEqual(ohne.krypto, { zuVersteuern: 0, steuer: 0 })

  const mit = berechneSteuerposition({ ...basis, kryptoZuVersteuern: 4000 })
  assert.equal(mit.krypto.zuVersteuern, 4000)
  assert.equal(mit.zve.betrag, ohne.zve.betrag + 4000)
  assert.ok(mit.krypto.steuer > 0)
  // Gewinn-Steuer und Krypto-Steuer zusammen sind genau die Mehrsteuer gegenueber "ohne Gewinn, ohne Krypto".
  const nurLohn = berechneSteuerposition({ ...basis, betriebseinnahmen: 0, betriebsausgaben: 0 })
  // (Die ausgewiesene Einkommensteuer ist auf volle Euro gerundet, die Schichten sind es nicht.)
  assert.ok(Math.abs(mit.gewinn_kostet.steuer + mit.krypto.steuer - (mit.steuer.einkommensteuer - nurLohn.steuer.einkommensteuer)) < 1)
  assert.equal(mit.ruecklage.soll, Math.round((mit.gewinn_kostet.steuer + mit.krypto.steuer) * 100) / 100)
})

test('Negativer Krypto-Wert mindert das Einkommen nicht', () => {
  const p = berechneSteuerposition({ ...EINGABEN, lohnNettoImJahr: 24_000, monateMitLohn: 12, kryptoZuVersteuern: -500 })
  assert.equal(p.krypto.zuVersteuern, 0)
})
