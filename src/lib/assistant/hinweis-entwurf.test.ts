import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hinweisEntwurf } from './hinweis-entwurf.ts'

test('Entwurf: Titel, Text, Herkunft und Schwere; Schlussfrage je Herkunft', () => {
  const t = hinweisEntwurf({
    title: 'Abos steigen',
    body: 'Drei Abos sind zusammen 22 € teurer geworden.',
    type: 'athena_review',
    severity: 'warning',
  })
  assert.match(t, /^Zu diesem Hinweis auf meinem Dashboard \(Wochenlauf, Achtung\): „Abos steigen“\n/)
  assert.match(t, /Drei Abos sind zusammen 22 € teurer geworden\./)
  assert.match(t, /erste konkrete Schritt\?$/)

  const r = hinweisEntwurf({ title: 'Miete fällig', body: null, type: 'reminder', severity: 'info' })
  assert.match(r, /\(Erinnerung, Zur Info\)/)
  assert.match(r, /bis wann/)
  assert.ok(!r.includes('null'))
})

test('Entwurf: unbekannte Herkunft und Schwere -> Standardfrage ohne Klammer', () => {
  const t = hinweisEntwurf({ title: 'X', body: '', type: 'chat', severity: 'egal' })
  assert.match(t, /^Zu diesem Hinweis auf meinem Dashboard: „X“\n\n/)
  assert.match(t, /was würdest du mir konkret empfehlen\?$/)
})

test('Entwurf: Umbrüche im Titel werden eingeebnet, lange Titel und Texte gekürzt', () => {
  const t = hinweisEntwurf({ title: 'a\nb   c' + 'x'.repeat(300), body: 'y'.repeat(3000), type: 'chat', severity: 'info' })
  const kopf = t.split('\n')[0]
  assert.ok(kopf.includes('„a b c'))
  assert.ok(kopf.endsWith('…“'))
  assert.ok(t.length < 1800)
})
