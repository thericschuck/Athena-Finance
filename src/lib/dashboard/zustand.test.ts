import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aeltesterSyncStunden, bewerteBank, bewerteDaten, bewerteSteuer, bewerteZustand, schlimmste,
} from './zustand.ts'
import type { ErinnerungsEingabe } from '../reminders/regeln.ts'

const JETZT = Date.parse('2026-10-23T12:00:00Z')
const vorStunden = (h: number) => new Date(JETZT - h * 3_600_000).toISOString()
const inTagen = (t: number) => new Date(JETZT + t * 86_400_000).toISOString()

test('aeltesterSyncStunden: nimmt den aeltesten, ignoriert Muell', () => {
  assert.equal(aeltesterSyncStunden([vorStunden(3), vorStunden(10), null, 'kaputt'], JETZT), 10)
  assert.equal(aeltesterSyncStunden([], JETZT), null)
})

test('Bank: gesund ist gruen und nennt das Alter', () => {
  const c = bewerteBank({ aeltesterSyncStunden: 3, sca: [{ bankLabel: 'Bank', lastScaAt: null, exemptionExpiresAt: inTagen(60), scaRequired: false }] }, JETZT)
  assert.equal(c?.stufe, 'ok')
  assert.equal(c?.label, 'Bank vor 3 Std.')
})

test('Bank: Sync gelb ab 36 h, rot ab 5 Tagen', () => {
  assert.equal(bewerteBank({ aeltesterSyncStunden: 36, sca: [] }, JETZT)?.stufe, 'ok')
  assert.equal(bewerteBank({ aeltesterSyncStunden: 37, sca: [] }, JETZT)?.stufe, 'warn')
  assert.equal(bewerteBank({ aeltesterSyncStunden: 121, sca: [] }, JETZT)?.stufe, 'fehler')
})

test('Bank: Freigabe gelb ab 14 Tagen Rest, rot bei abgelaufen oder fehlend', () => {
  const sca = (exemptionExpiresAt: string | null, scaRequired = false) => [{ bankLabel: 'Postbank', lastScaAt: null, exemptionExpiresAt, scaRequired }]
  assert.equal(bewerteBank({ aeltesterSyncStunden: 2, sca: sca(inTagen(15.5)) }, JETZT)?.stufe, 'ok')
  const gelb = bewerteBank({ aeltesterSyncStunden: 2, sca: sca(inTagen(9.5)) }, JETZT)
  assert.equal(gelb?.stufe, 'warn')
  assert.match(gelb?.label ?? '', /Freigabe läuft in 9 Tagen ab/)
  assert.equal(bewerteBank({ aeltesterSyncStunden: 2, sca: sca(inTagen(-1)) }, JETZT)?.stufe, 'fehler')
  assert.equal(bewerteBank({ aeltesterSyncStunden: 2, sca: sca(null, true) }, JETZT)?.stufe, 'fehler')
})

test('Bank: ohne Salden und ohne Freigabedaten kein Chip', () => {
  assert.equal(bewerteBank({ aeltesterSyncStunden: null, sca: [] }, JETZT), null)
})

const steuer = (p: Partial<NonNullable<ErinnerungsEingabe['steuer']>> = {}): ErinnerungsEingabe['steuer'] => ({
  jahr: 2026,
  ruecklage: { soll: 1000, ist: 1000, luecke: 0 },
  kleinunternehmer: { status: 'gruen', umsatzLaufend: 1000, grenzeLaufend: 100000 },
  krypto: null,
  ...p,
})

test('Steuer: ohne Berechnung kein Chip, ohne Befund „Steuer ok"', () => {
  assert.equal(bewerteSteuer(null, '2026-10-23'), null)
  const c = bewerteSteuer(steuer(), '2026-10-23')
  assert.equal(c?.stufe, 'ok')
  assert.equal(c?.label, 'Steuer ok')
})

test('Steuer: Ruecklage-Luecke ab 50 EUR, gerundet auf 10', () => {
  assert.equal(bewerteSteuer(steuer({ ruecklage: { soll: 1000, ist: 960, luecke: 40 } }), '2026-10-23')?.stufe, 'ok')
  const c = bewerteSteuer(steuer({ ruecklage: { soll: 1500, ist: 862, luecke: 638 } }), '2026-10-23')
  assert.equal(c?.stufe, 'warn')
  assert.match(c?.label ?? '', /^Steuer: Rücklage fehlt ca\. 640/)
})

test('Steuer: ohne Sparziel (ist null) warnt', () => {
  const c = bewerteSteuer(steuer({ ruecklage: { soll: 800, ist: null, luecke: null } }), '2026-10-23')
  assert.equal(c?.stufe, 'warn')
  assert.match(c?.label ?? '', /kein Sparziel/)
})

test('Steuer: schlimmster Zustand bestimmt den Chip (Kleinunternehmer rot vor Ruecklage gelb)', () => {
  const c = bewerteSteuer(steuer({
    ruecklage: { soll: 1500, ist: 0, luecke: 1500 },
    kleinunternehmer: { status: 'rot', umsatzLaufend: 120000, grenzeLaufend: 100000 },
  }), '2026-10-23')
  assert.equal(c?.stufe, 'fehler')
  assert.equal(c?.label, 'Kleinunternehmer-Grenze überschritten')
  assert.equal(c?.zeilen.length, 2)
})

test('Steuer: Haltefrist nur innerhalb von 30 Tagen, als Hinweis (info)', () => {
  const lose = (tage: number) => [{ anschaffungId: 'a', asset: 'BTC', quantity: 1, steuerfreiAb: new Date(Date.parse('2026-10-23T00:00:00Z') + tage * 86_400_000).toISOString().slice(0, 10) }]
  const krypto = (offeneLose: ReturnType<typeof lose>) => ({ saldoSteuerpflichtig: 0, zuVersteuern: 0, freigrenze: 1000, offeneLose })
  const nah = bewerteSteuer(steuer({ krypto: krypto(lose(12)) }), '2026-10-23')
  assert.equal(nah?.stufe, 'info')
  assert.equal(nah?.label, 'Krypto: Frist endet in 12 Tagen')
  assert.equal(bewerteSteuer(steuer({ krypto: krypto(lose(45)) }), '2026-10-23')?.stufe, 'ok')
})

test('Steuer: Krypto-Freigrenze ueberschritten ist gelb', () => {
  const c = bewerteSteuer(steuer({ krypto: { saldoSteuerpflichtig: 1200, zuVersteuern: 1200, freigrenze: 1000, offeneLose: [] } }), '2026-10-23')
  assert.equal(c?.stufe, 'warn')
})

test('Daten: nur bei mehr als 0, nie rot', () => {
  assert.equal(bewerteDaten(0), null)
  const c = bewerteDaten(12)
  assert.equal(c?.label, '12 ohne Kategorie')
  assert.equal(c?.href, '/analyse/banking?kat=offen')
  assert.equal(c?.stufe, 'info')
})

test('Gesamt: schlimmster Chip bestimmt die Zeile, info zaehlt als gesund', () => {
  assert.equal(schlimmste([]), 'ok')
  const ruhig = bewerteZustand([bewerteBank({ aeltesterSyncStunden: 3, sca: [] }, JETZT), bewerteSteuer(steuer(), '2026-10-23'), bewerteDaten(4)])
  assert.equal(ruhig.gesund, true)
  const rot = bewerteZustand([bewerteBank({ aeltesterSyncStunden: 200, sca: [] }, JETZT), null])
  assert.equal(rot.stufe, 'fehler')
  assert.equal(rot.gesund, false)
  assert.equal(rot.chips.length, 1)
})
