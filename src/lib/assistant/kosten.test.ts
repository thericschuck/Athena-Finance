import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregiereKosten, berlinerTag, formatTokensKompakt, type KostenZeile } from './kosten.ts'

const jetzt = new Date('2026-10-26T10:00:00Z') // 12:00 Berlin (MESZ endet 25.10., dann MEZ 11:00)

const sonnet = (zeit: string, usage: KostenZeile['usage'], quelle: KostenZeile['quelle'] = 'chat'): KostenZeile => ({
  zeit,
  model: 'claude-sonnet-5',
  usage,
  quelle,
})

test('Berliner Kalendertag statt UTC', () => {
  // 23:30 UTC am 25.10. ist 00:30 Berlin (MEZ) am 26.10.
  assert.equal(berlinerTag('2026-10-25T23:30:00Z'), '2026-10-26')
  // Sommerzeit: 22:30 UTC ist schon der nächste Tag
  assert.equal(berlinerTag('2026-08-31T22:30:00Z'), '2026-09-01')
})

test('Lücken-Tage mit 0, Länge = Zeitraum, letzter Tag = heute', () => {
  const a = aggregiereKosten([], 30, jetzt)
  assert.equal(a.tage.length, 30)
  assert.equal(a.tage[29].tag, '2026-10-26')
  assert.equal(a.tage[0].tag, '2026-09-27')
  assert.equal(a.summe.kosten, 0)
  assert.equal(a.kostenProAntwort, null)
  assert.equal(a.cacheQuote, null)
  assert.equal(aggregiereKosten([], 90, jetzt).tage.length, 90)
})

test('Tokens, Cache und Kosten je Tag; Ø und Cache-Quote', () => {
  const usage = { inputTokens: 1_000_000, outputTokens: 0, inputTokenDetails: { cacheReadTokens: 800_000, cacheWriteTokens: 100_000, noCacheTokens: 100_000 } }
  const zeilen = [
    sonnet('2026-10-25T23:30:00Z', usage), // Berlin: 26.10.
    sonnet('2026-10-26T08:00:00Z', { inputTokens: 1000, outputTokens: 1000 }),
    sonnet('2026-01-01T08:00:00Z', usage), // außerhalb
  ]
  const a = aggregiereKosten(zeilen, 30, jetzt)
  const heute = a.tage[29]
  assert.equal(heute.laeufe, 2)
  assert.equal(heute.eingabe, 100_000 + 1000)
  assert.equal(heute.cacheLesen, 800_000)
  assert.equal(heute.cacheSchreiben, 100_000)
  assert.equal(heute.ausgabe, 1000)
  assert.ok(Math.abs(heute.kosten - (0.915 + 0.018)) < 1e-9)
  assert.equal(a.summe.antworten, 2)
  assert.equal(a.summe.tokens, 1_000_000 + 2000)
  assert.ok(Math.abs((a.kostenProAntwort ?? 0) - 0.933 / 2) < 1e-9)
  assert.ok(Math.abs((a.cacheQuote ?? 0) - 800_000 / 1_001_000) < 1e-9)
})

test('Unbekanntes Modell: Tokens zählen, Kosten null, als ohne Preis markiert', () => {
  const a = aggregiereKosten(
    [{ zeit: '2026-10-26T08:00:00Z', model: 'claude-zukunft', usage: { inputTokens: 500, outputTokens: 100 }, quelle: 'chat' }],
    30,
    jetzt,
  )
  assert.equal(a.summe.tokens, 600)
  assert.equal(a.summe.kosten, 0)
  assert.equal(a.summe.ohnePreis, 1)
  assert.equal(a.modelle[0].kosten, null)
  assert.equal(a.kostenProAntwort, null)
})

test('Automatische Läufe getrennt; Modell-Aufteilung zählt beide', () => {
  const a = aggregiereKosten(
    [
      sonnet('2026-10-26T08:00:00Z', { inputTokens: 1000, outputTokens: 1000 }),
      sonnet('2026-10-26T08:05:00Z', { inputTokens: 2000, outputTokens: 0 }, 'auto'),
      { zeit: '2026-10-26T08:10:00Z', model: 'claude-haiku-4-5', usage: { inputTokens: 100, outputTokens: 10 }, quelle: 'auto' },
    ],
    30,
    jetzt,
  )
  const heute = a.tage[29]
  assert.equal(heute.laeufe, 1)
  assert.equal(heute.auto.laeufe, 2)
  assert.equal(heute.auto.tokens, 2110)
  assert.equal(a.summe.autoLaeufe, 2)
  assert.equal(a.modelle.find((m) => m.model === 'claude-sonnet-5')?.laeufe, 2)
  assert.deepEqual(Object.keys(heute.kostenNachModell), ['claude-sonnet-5'])
})

test('Kompakte Token-Zahl', () => {
  assert.equal(formatTokensKompakt(1_234_567), '1,2 Mio')
  assert.equal(formatTokensKompakt(340_000), '340 Tsd')
  assert.equal(formatTokensKompakt(512), '512')
})
