import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leseSteuerprofil, schreibeSteuerprofil, STEUERPROFIL_STANDARD } from './profil.ts'

/**
 * Der Wert kommt als beliebiges jsonb aus user_settings. Diese Tests halten
 * fest, dass daraus nie NaN oder eine Division durch null in die
 * Steuerrechnung durchschlaegt.
 */

test('null und Unsinn ergeben den Standard', () => {
  assert.deepEqual(leseSteuerprofil(null), STEUERPROFIL_STANDARD)
  assert.deepEqual(leseSteuerprofil('kaputt'), STEUERPROFIL_STANDARD)
  assert.deepEqual(leseSteuerprofil([1, 2, 3]), STEUERPROFIL_STANDARD)
  assert.deepEqual(leseSteuerprofil(42), STEUERPROFIL_STANDARD)
})

test('vollstaendiges Profil wird uebernommen', () => {
  const p = leseSteuerprofil({
    brutto_jahreslohn: 45_000,
    brutto_stand: '2026-09-06',
    vorsorge_anteil_pct: 20,
    kirchensteuer_pct: 8,
    netto_quote: 0.62,
    kleinunternehmer: false,
  })
  assert.equal(p.bruttoJahreslohn, 45_000)
  assert.equal(p.bruttoStand, '2026-09-06')
  assert.equal(p.vorsorgeAnteilPct, 20)
  assert.equal(p.kirchensteuerPct, 8)
  assert.equal(p.nettoQuote, 0.62)
  assert.equal(p.kleinunternehmer, false)
})

test('Zahlen als String werden akzeptiert -- Formulare liefern Strings', () => {
  const p = leseSteuerprofil({ brutto_jahreslohn: '45000', kirchensteuer_pct: '8' })
  assert.equal(p.bruttoJahreslohn, 45_000)
  assert.equal(p.kirchensteuerPct, 8)
})

test('unsinnige Zahlen fallen auf den Standard zurueck statt NaN zu erzeugen', () => {
  const p = leseSteuerprofil({
    vorsorge_anteil_pct: 'abc',
    kirchensteuer_pct: -5,
    netto_quote: 0,          // waere eine Division durch null
  })
  assert.equal(p.vorsorgeAnteilPct, 19)
  assert.equal(p.kirchensteuerPct, 0)
  assert.equal(p.nettoQuote, 0.75)
})

test('Netto-Quote ueber 1 ist unmoeglich und wird verworfen', () => {
  assert.equal(leseSteuerprofil({ netto_quote: 1.4 }).nettoQuote, 0.75)
})

test('Bruttolohn 0 oder negativ zaehlt als nicht gepflegt', () => {
  assert.equal(leseSteuerprofil({ brutto_jahreslohn: 0 }).bruttoJahreslohn, null)
  assert.equal(leseSteuerprofil({ brutto_jahreslohn: -100 }).bruttoJahreslohn, null)
})

test('kaputtes Standdatum wird verworfen, nicht weitergereicht', () => {
  assert.equal(leseSteuerprofil({ brutto_jahreslohn: 45_000, brutto_stand: '06.09.2026' }).bruttoStand, null)
  assert.equal(leseSteuerprofil({ brutto_jahreslohn: 45_000, brutto_stand: '2026-13-45' }).bruttoStand, null)
})

test('ohne Bruttolohn gibt es auch keinen Stand', () => {
  assert.equal(leseSteuerprofil({ brutto_stand: '2026-09-06' }).bruttoStand, null)
})

test('lesen und schreiben ist verlustfrei', () => {
  const original = {
    brutto_jahreslohn: 45_000,
    brutto_stand: '2026-09-06',
    vorsorge_anteil_pct: 20,
    kirchensteuer_pct: 8,
    netto_quote: 0.62,
    kleinunternehmer: false,
  }
  assert.deepEqual(schreibeSteuerprofil(leseSteuerprofil(original)), original)
})
