import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bereinigeText, istFaellig, leseReviewConfig, waehleBefunde, REVIEW_SYSTEM_PROMPT, type Befund, type ReviewConfig,
} from './review-regeln.ts'

const STANDARD: ReviewConfig = { enabled: true, model: 'claude-opus-5', effort: 'medium', maxSteps: 14 }
const b = (title: string, body = 'Ein ausreichend langer Text mit 120 €.', severity: Befund['severity'] = 'info'): Befund =>
  ({ severity, title, body, quellen: ['getForecast'] })

test('Konfiguration: Standard bei Müll, feldweise Überschreibung, Schritte begrenzt', () => {
  assert.deepEqual(leseReviewConfig(null, STANDARD), STANDARD)
  assert.deepEqual(leseReviewConfig('x', STANDARD), STANDARD)
  assert.equal(leseReviewConfig({ enabled: false }, STANDARD).enabled, false)
  assert.equal(leseReviewConfig({ model: 'claude-sonnet-5' }, STANDARD).model, 'claude-sonnet-5')
  assert.equal(leseReviewConfig({ model: 'gpt-4; drop table' }, STANDARD).model, 'claude-opus-5')
  assert.equal(leseReviewConfig({ effort: 'extreme' }, STANDARD).effort, 'medium')
  assert.equal(leseReviewConfig({ maxSteps: 500 }, STANDARD).maxSteps, 24)
  assert.equal(leseReviewConfig({ maxSteps: 1 }, STANDARD).maxSteps, 6)
  assert.equal(leseReviewConfig({ maxSteps: 'viel' }, STANDARD).maxSteps, 14)
})

test('Fälligkeit: ohne Vorlauf oder mit unlesbarem Stempel ja, sonst erst nach 5 Tagen', () => {
  const jetzt = new Date('2026-10-26T06:00:00Z')
  assert.equal(istFaellig(undefined, jetzt), true)
  assert.equal(istFaellig('kein datum', jetzt), true)
  assert.equal(istFaellig('2026-10-22T06:00:00Z', jetzt), false)
  assert.equal(istFaellig('2026-10-21T06:00:00Z', jetzt), true)
})

test('Bereinigung entfernt Links, HTML, Auszeichnung und kürzt hart', () => {
  assert.equal(bereinigeText('Siehe [hier](https://evil.example/x) und https://evil.example oder www.evil.de ok', 200), 'Siehe hier und oder ok')
  assert.equal(bereinigeText('<b>fett</b> **stark** `code` # Titel', 200), 'fett stark code Titel')
  assert.equal(bereinigeText('a\u0000b\u0007c', 50), 'abc')
  const lang = bereinigeText('x'.repeat(500), 100)
  assert.equal(lang.length, 100)
  assert.ok(lang.endsWith('…'))
})

test('Auswahl: höchstens fünf, Warnungen zuerst, Dubletten und bekannte Titel raus', () => {
  const roh = [
    b('Info eins'), b('Warnung eins', undefined, 'warning'), b('Info zwei'), b('Info drei'),
    b('Info vier'), b('Info fünf'), b('Warnung zwei', undefined, 'warning'),
    b('INFO EINS!'),                       // Dublette von "Info eins"
    b('Schon offen'),                      // steht bereits als Hinweis da
    b('Zu kurz', 'kurz'),                  // Text zu kurz
  ]
  const r = waehleBefunde(roh, ['Schon offen'])
  assert.equal(r.length, 5)
  assert.deepEqual(r.slice(0, 2).map(x => x.severity), ['warning', 'warning'])
  assert.equal(r.filter(x => x.title.toLowerCase().includes('eins')).length, 2) // "Warnung eins" + "Info eins"
  assert.ok(!r.some(x => x.title === 'Schon offen' || x.title === 'Zu kurz'))
})

test('Auswahl: Text im Befund wird bereinigt, Quellen begrenzt', () => {
  const r = waehleBefunde([{ ...b('Titel mit Link https://x.de ok'), body: 'Text [klick](http://x.de) mit genug Länge', quellen: ['a', 'b', 'c', 'd', 'e'] }], [])
  assert.equal(r[0].title, 'Titel mit Link ok')
  assert.equal(r[0].body, 'Text klick mit genug Länge')
  assert.equal(r[0].quellen.length, 4)
})

test('Prompt: nennt die Leitplanken und das einzige Ausgabewerkzeug', () => {
  for (const s of ['meldeBefund', 'untrusted_', 'Keine erfundenen Zahlen', 'Höchstens fünf', 'getInsights']) {
    assert.ok(REVIEW_SYSTEM_PROMPT.includes(s), s)
  }
})
