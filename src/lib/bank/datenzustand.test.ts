import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  alterText, findeDuplikate, findeLuecken, pruefeDatenzustand, scaBefunde, syncStufe,
  type ZustandBuchung,
} from './datenzustand.ts'

const HEUTE = '2026-10-23'
const JETZT = Date.parse('2026-10-23T12:00:00Z')

const tx = (datum: string, extra: Partial<ZustandBuchung> = {}): ZustandBuchung => ({
  account_iban: 'DE01', value_date: datum, amount: -10, counterpart_name: 'Rewe', description: 'Einkauf', ...extra,
})

/** Alle `schritt` Tage eine Buchung, rueckwaerts ab `ende`, `n` Stueck. */
function serie(ende: string, schritt: number, n: number): ZustandBuchung[] {
  const out: ZustandBuchung[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.parse(`${ende}T00:00:00Z`) - i * schritt * 86400000).toISOString().slice(0, 10)
    out.push(tx(d, { description: `Buchung ${i}` }))
  }
  return out
}

test('Sync-Alter: 36 h gelb, 5 Tage rot', () => {
  assert.equal(syncStufe(10), null)
  assert.equal(syncStufe(36), null)
  assert.equal(syncStufe(37), 'warn')
  assert.equal(syncStufe(120), 'warn')
  assert.equal(syncStufe(121), 'fehler')
  assert.equal(alterText(3), 'vor 3 Std.')
  assert.equal(alterText(72), 'vor 3 Tagen')
})

test('Luecken: regelmaessiges Konto ohne Befund, Mindestschwelle 14 Tage', () => {
  assert.equal(findeLuecken(serie(HEUTE, 2, 60), HEUTE).length, 0)
})

test('Luecken: 20 Tage Stille bei einem Konto mit Buchungen alle 2 Tage wird gemeldet', () => {
  const b = [...serie('2026-09-20', 2, 40), ...serie(HEUTE, 2, 2)]
  // Buchungen bis 20.09., dann wieder ab 21.10. -> Luecke 20.09.-19.10.
  const l = findeLuecken(b, HEUTE)
  assert.equal(l.length, 1)
  assert.equal(l[0].von, '2026-09-20')
  assert.equal(l[0].offen, false)
})

test('Luecken: offene Luecke bis heute zaehlt, stillgelegte Konten nicht', () => {
  const offen = findeLuecken(serie('2026-09-25', 2, 40), HEUTE)
  assert.equal(offen.length, 1)
  assert.equal(offen[0].offen, true)
  // Letzte Buchung vor ueber 90 Tagen: Konto gilt als stillgelegt.
  assert.equal(findeLuecken(serie('2026-05-01', 2, 40), HEUTE).length, 0)
  // Zu wenige Buchungen insgesamt.
  assert.equal(findeLuecken(serie('2026-08-01', 2, 3), HEUTE).length, 0)
})

test('Luecken: Konto mit monatlichem Rhythmus braucht eine hoehere Schwelle als 14 Tage', () => {
  const b = serie(HEUTE, 30, 12)
  assert.equal(findeLuecken(b, HEUTE).length, 0)
})

test('Duplikate: gleiche Buchung ohne Referenz wird gemeldet', () => {
  const d = findeDuplikate([tx('2026-10-01'), tx('2026-10-01'), tx('2026-10-02')])
  assert.equal(d.length, 1)
  assert.equal(d[0].anzahl, 2)
})

test('Duplikate: verschiedene Bankreferenzen sind zwei echte Buchungen', () => {
  const d = findeDuplikate([
    tx('2026-10-01', { bank_reference: 'A' }), tx('2026-10-01', { bank_reference: 'B' }),
  ])
  assert.equal(d.length, 0)
})

test('Duplikate: gleiche Referenz oder nur eine Referenz bleibt Verdacht; IBAN-Schreibweise egal', () => {
  assert.equal(findeDuplikate([
    tx('2026-10-01', { bank_reference: 'A' }), tx('2026-10-01', { bank_reference: 'A' }),
  ]).length, 1)
  assert.equal(findeDuplikate([
    tx('2026-10-01', { bank_reference: 'A' }), tx('2026-10-01'),
  ]).length, 1)
  assert.equal(findeDuplikate([
    tx('2026-10-01', { account_iban: 'DE01 ' }), tx('2026-10-01', { account_iban: 'de01' }),
  ]).length, 1)
})

test('Freigabe: abgelaufen rot, bald gelb, fehlend rot, sonst nichts', () => {
  const tage = (n: number) => new Date(JETZT + n * 86400000).toISOString()
  const mk = (exp: string | null, req = false) =>
    scaBefunde([{ bankLabel: 'Bank', lastScaAt: null, exemptionExpiresAt: exp, scaRequired: req }], JETZT)
  assert.equal(mk(tage(60)).length, 0)
  assert.equal(mk(tage(10))[0].stufe, 'warn')
  assert.equal(mk(tage(-1))[0].stufe, 'fehler')
  assert.equal(mk(tage(60), true)[0].stufe, 'fehler')
  assert.equal(mk(null).length, 0)
})

test('Gesamtpruefung: gesunder Zustand ohne Befunde, veralteter Sync wird gemeldet', () => {
  const gesund = pruefeDatenzustand({
    balances: [{ account_iban: 'DE01', account_name: 'Giro', fetched_at: '2026-10-23T09:00:00Z' }],
    transactions: serie(HEUTE, 2, 60), heute: HEUTE, jetzt: JETZT,
  })
  assert.equal(gesund.befunde.length, 0)
  assert.equal(Math.round(gesund.juengsterSyncStunden ?? -1), 3)

  const alt = pruefeDatenzustand({
    balances: [{ account_iban: 'DE01', account_name: 'Giro', fetched_at: '2026-10-15T09:00:00Z' }],
    transactions: serie('2026-10-15', 2, 60), heute: HEUTE, jetzt: JETZT,
  })
  assert.ok(alt.befunde.some(b => b.art === 'sync' && b.stufe === 'fehler'))
})
